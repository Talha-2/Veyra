<?php

namespace App\Services\Agent;

use App\Models\AgentThread;
use App\Models\AutomationRun;
use App\Models\Conversation;
use App\Models\Organization;
use App\Models\Skill;
use GuzzleHttp\Handler\StreamHandler;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Psr\Http\Message\StreamInterface;

/**
 * The only way the app layer talks to the agent layer.
 *
 * Every method here is one route on the Python gateway, and no controller
 * calls `Http::post()` at an agent URL directly — that rule is what keeps the
 * contract greppable from either side. The app pushes work (start a run, test
 * a skill, place a call); the agent pulls everything else through
 * `/api/agent/v1`. Pushing is for immediacy, pulling is for robustness: a run
 * that could not be pushed is still claimed later, so nothing is lost when the
 * agent layer is down at the moment someone presses the button.
 */
class AgentGateway
{
    /**
     * Read from config at call time, not at construction: the service is a
     * singleton, and a value captured once would outlive a config change —
     * which is exactly what a test that switches the gateway on does, and
     * what a runtime config reload would do.
     */
    private function url(): ?string
    {
        return config('services.agent.url');
    }

    private function secret(): ?string
    {
        return config('services.agent.secret');
    }

    private function timeout(): int
    {
        return (int) config('services.agent.timeout', 10);
    }

    public function configured(): bool
    {
        return filled($this->url()) && filled($this->secret());
    }

    /**
     * Whether the gateway answers right now. Cached briefly: Studio asks on
     * every page that mentions the agent, and a health probe per page view
     * would be its own small outage.
     */
    public function available(): bool
    {
        if (! $this->configured()) {
            return false;
        }

        return Cache::remember('agent-gateway:available', now()->addSeconds(30), function () {
            try {
                return $this->client(timeout: 2)->get('/v1/health')->successful();
            } catch (ConnectionException) {
                return false;
            }
        });
    }

    /**
     * What the agent layer can run with: which model providers have keys,
     * which models each offers, and the defaults. The layer that holds the
     * keys reports them; the app never has to know a provider's key.
     *
     * @return array{providers: list<array{id:string,label:string,configured:bool,models:list<array{ref:string,label:string,role:string}>}>, defaults: array{talker:string,worker:string}, voice: array}
     */
    public function capabilities(): array
    {
        $empty = ['providers' => [], 'defaults' => ['talker' => '', 'worker' => ''], 'voice' => []];
        if (! $this->configured()) {
            return $empty;
        }

        return Cache::remember('agent-gateway:capabilities', now()->addMinutes(5), function () use ($empty) {
            try {
                $body = $this->decode($this->client(timeout: 4)->get('/v1/capabilities')->throw());

                return ['providers' => $body['providers'] ?? [], 'defaults' => $body['defaults'] ?? $empty['defaults'], 'voice' => $body['voice'] ?? []];
            } catch (ConnectionException|RequestException) {
                return $empty;
            }
        });
    }

    /**
     * One Ask turn, streamed. Returns the open response body; the caller
     * reads server-sent events off it and relays them.
     *
     * The timeout is the whole turn's ceiling (a worker delegation is capped
     * at 150 s on the agent side); the connect timeout stays short so a dead
     * gateway fails fast instead of holding the person's cursor.
     *
     * @param  list<array{role: string, content: string}>  $history
     */
    public function streamThread(AgentThread $thread, string $message, array $history): StreamInterface
    {
        return $this->streamPost('/v1/threads/stream', [
            'organization_id' => Organization::currentId(),
            'thread_id' => $thread->id,
            'message' => $message,
            'history' => $history,
        ]);
    }

    /**
     * One live-chat turn with the customer-facing agent (Studio Talk, and
     * later the public chat API), streamed like Ask. The app sends the
     * conversation's context bundle with the message, so the gateway does not
     * make a second round trip before the first token.
     *
     * @param  list<array{role: string, content: string}>  $history
     */
    public function streamChat(Conversation $conversation, string $message, array $history, array $context): StreamInterface
    {
        return $this->streamPost('/v1/chat/stream', [
            'organization_id' => Organization::currentId(),
            'conversation_id' => $conversation->id,
            'message' => $message,
            'history' => $history,
            'context' => $context,
        ]);
    }

    /**
     * POST that returns the open SSE body. Guzzle's default curl handler
     * ignores `stream` and downloads the whole body before returning, which
     * relayed every token at once at the end of the turn; the PHP-stream
     * handler reads as bytes arrive. HTTP/1.0 keeps the gateway from
     * chunk-encoding the body: PHP's dechunk filter fills 8 KB before handing
     * anything over. Http::fake still applies: fakes are stack middleware.
     */
    private function streamPost(string $path, array $payload): StreamInterface
    {
        if (! $this->configured()) {
            throw AgentUnavailable::notConfigured();
        }

        try {
            $response = $this->client(timeout: 180)
                ->setHandler(new StreamHandler)
                ->withOptions(['stream' => true, 'read_timeout' => 180, 'version' => '1.0'])
                ->withHeaders(['Accept' => 'text/event-stream'])
                ->post($path, $payload)
                ->throw();
        } catch (ConnectionException $e) {
            Cache::forget('agent-gateway:available');
            throw AgentUnavailable::because($e->getMessage());
        } catch (RequestException $e) {
            throw AgentUnavailable::because("HTTP {$e->response->status()} from {$path}");
        }

        return $response->toPsrResponse()->getBody();
    }

    /** Start (or continue) a deep-agent run on an Ask thread. */
    public function startThreadRun(AgentThread $thread, string $message): array
    {
        return $this->post('/v1/runs', [
            'kind' => 'thread',
            'organization_id' => Organization::currentId(),
            'thread_id' => $thread->id,
            'external_id' => $thread->external_id,
            'message' => $message,
        ]);
    }

    /** Start a queued automation run now rather than waiting for the claim loop. */
    public function startAutomationRun(AutomationRun $run): array
    {
        return $this->post('/v1/runs', [
            'kind' => 'automation',
            'organization_id' => Organization::currentId(),
            'run_id' => $run->id,
            'automation_id' => $run->automation_id,
        ]);
    }

    /**
     * Run a skill against a scenario without a caller: the Studio "try it" button.
     *
     * Synchronous by design — the author is watching — and a dry run is
     * several model turns, so it gets its own ceiling rather than the
     * default 10 s that starting a run needs. The first live try timed out at
     * 10 s while the gateway finished the run 5 s later.
     */
    public function testSkill(Skill $skill, string $scenario): array
    {
        return $this->post('/v1/skills/test', [
            'organization_id' => Organization::currentId(),
            'skill' => $skill->slug,
            'version' => $skill->version,
            'scenario' => $scenario,
        ], timeout: 110);
    }

    /** Place an outbound call. Returns the agent's call handle; the call row is created when the agent reports it. */
    public function placeCall(string $to, string $from, string $goal, array $context = []): array
    {
        return $this->post('/v1/calls/outbound', [
            'organization_id' => Organization::currentId(),
            'to' => $to,
            'from' => $from,
            'goal' => $goal,
            'context' => $context,
        ]);
    }

    private function post(string $path, array $payload, ?int $timeout = null): array
    {
        if (! $this->configured()) {
            throw AgentUnavailable::notConfigured();
        }

        try {
            return $this->decode($this->client($timeout)->post($path, $payload)->throw());
        } catch (ConnectionException $e) {
            Cache::forget('agent-gateway:available');
            throw AgentUnavailable::because($e->getMessage());
        } catch (RequestException $e) {
            throw AgentUnavailable::because("HTTP {$e->response->status()} from {$path}: ".str($e->response->body())->limit(300));
        }
    }

    private function client(?int $timeout = null): PendingRequest
    {
        return Http::baseUrl(rtrim((string) $this->url(), '/'))
            ->withToken((string) $this->secret())
            ->acceptJson()
            ->timeout($timeout ?? $this->timeout())
            ->connectTimeout(3);
    }

    private function decode(Response $response): array
    {
        $data = $response->json();

        return is_array($data) ? $data : ['raw' => $response->body()];
    }
}
