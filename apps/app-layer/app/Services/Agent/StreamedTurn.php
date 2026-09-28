<?php

namespace App\Services\Agent;

use Psr\Http\Message\StreamInterface;

/**
 * One agent turn, accumulated from the gateway's server-sent events exactly as
 * the browser builds it: text parts interleaved with tool steps, in the order
 * they happened. Used by Ask (the builder chat) and by Talk's live chat (the
 * customer-facing agent), which relay the same event stream.
 */
final class StreamedTurn
{
    /** @var list<array<string, mixed>> */
    public array $parts = [];

    public bool $finished = false;

    public bool $stopped = false;

    public ?string $error = null;

    public int $tokens = 0;

    public ?string $model = null;

    /**
     * Read SSE frames off the gateway's body, fold each event into this turn
     * and hand it to `$send` (which writes it to the browser). Stops when the
     * body ends or the browser disconnects; a stream that ends without `done`
     * or `error` is recorded as an error, never as a finished reply.
     *
     * @param  callable(array<string, mixed>): void  $send
     */
    public function relay(StreamInterface $body, callable $send): void
    {
        $buffer = '';
        while (! $body->eof()) {
            if (connection_aborted()) {
                $this->stopped = true;
                break;
            }
            $buffer .= $body->read(2048);
            while (($pos = strpos($buffer, "\n\n")) !== false) {
                $frame = substr($buffer, 0, $pos);
                $buffer = substr($buffer, $pos + 2);
                foreach (explode("\n", $frame) as $line) {
                    if (! str_starts_with($line, 'data: ')) {
                        continue;
                    }
                    $event = json_decode(substr($line, 6), true);
                    if (! is_array($event)) {
                        continue;
                    }
                    $this->apply($event);
                    $send($event);
                }
            }
        }
        $body->close();

        if (! $this->finished && ! $this->stopped && ! $this->error) {
            $this->fail('The agent stopped before finishing its reply.');
            $send(['type' => 'error', 'message' => $this->error]);
        }
    }

    public function apply(array $event): void
    {
        match ($event['type'] ?? null) {
            'delta' => $this->appendText((string) ($event['text'] ?? '')),
            'tool' => $this->tool($event),
            'done' => $this->finish($event),
            'error' => $this->fail((string) ($event['message'] ?? 'The agent failed.')),
            default => null,
        };
    }

    public function fail(string $message): void
    {
        $this->error = $message;
    }

    public function text(): string
    {
        return trim(collect($this->parts)->where('type', 'text')->pluck('text')->implode(''));
    }

    /** @return list<array<string, mixed>> */
    public function steps(): array
    {
        return collect($this->parts)->where('type', 'tool')->values()->all();
    }

    public function toMessage(): array
    {
        return array_filter([
            'role' => 'assistant',
            'content' => $this->text(),
            'parts' => $this->parts,
            'at' => now()->toIso8601String(),
            'stopped' => $this->stopped ?: null,
            'error' => $this->error,
            'tokens' => $this->tokens ?: null,
            'model' => $this->model,
        ], fn ($v) => $v !== null && $v !== []);
    }

    private function appendText(string $delta): void
    {
        $last = array_key_last($this->parts);
        if ($last !== null && $this->parts[$last]['type'] === 'text') {
            $this->parts[$last]['text'] .= $delta;
        } else {
            $this->parts[] = ['type' => 'text', 'text' => $delta];
        }
    }

    private function tool(array $event): void
    {
        $step = array_intersect_key($event, array_flip(['id', 'name', 'status', 'label', 'detail', 'summary', 'ms']));
        foreach ($this->parts as $i => $part) {
            if ($part['type'] === 'tool' && ($part['id'] ?? null) === ($event['id'] ?? null)) {
                $this->parts[$i] = [...$part, ...$step];

                return;
            }
        }
        $this->parts[] = ['type' => 'tool', ...$step];
    }

    private function finish(array $event): void
    {
        $this->finished = true;
        $this->tokens = (int) ($event['tokens'] ?? 0);
        $this->model = $event['model'] ?? null;
        // A model that did not stream still says everything in `done`.
        if (! collect($this->parts)->contains('type', 'text') && filled($event['content'] ?? '')) {
            $this->parts[] = ['type' => 'text', 'text' => $event['content']];
        }
    }
}
