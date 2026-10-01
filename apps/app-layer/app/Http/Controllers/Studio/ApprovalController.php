<?php

namespace App\Http\Controllers\Studio;

use App\Enums\ActionKind;
use App\Enums\ToolCallStatus;
use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\ToolCall;
use App\Services\Agent\AgentGateway;
use App\Services\Agent\AgentUnavailable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;

/**
 * Actions marked "Needs approval", decided by a person.
 *
 * The agent never runs such an action itself: the executor records it as
 * `awaiting_approval` with the arguments it wanted, and tells the customer a
 * person will review it. Here a person approves it — the agent layer runs it
 * once, through the same executor and handler as on a call, and the request
 * row is closed with what happened — or rejects it, which proves it never
 * ran.
 *
 * The row is claimed with a conditional update before anything runs, so two
 * people pressing Approve at once run it once.
 */
class ApprovalController extends Controller
{
    public function approve(ToolCall $toolCall, AgentGateway $gateway): RedirectResponse
    {
        $action = $toolCall->action ?? Action::query()->where('slug', $toolCall->action_slug)->first();
        if (! $action) {
            return back()->with('error', 'That action no longer exists, so it cannot run. Reject the request instead.');
        }

        if (! $this->claim($toolCall, ToolCallStatus::Running)) {
            return back()->with('warning', 'Someone has already decided this request.');
        }

        try {
            $outcome = $gateway->executeTool($action->toToolSpec(), $this->arguments($toolCall, $action), $toolCall->id);
        } catch (AgentUnavailable $e) {
            // Nothing ran: put the request back for another try.
            $toolCall->forceFill(['status' => ToolCallStatus::AwaitingApproval, 'approved_by_id' => null, 'approved_at' => null])->save();

            return back()->with('error', 'The agent layer could not run it: '.str($e->getMessage())->limit(200).' The request is still waiting.');
        }

        $status = ToolCallStatus::tryFrom($outcome['status'] ?? '') ?? (($outcome['ok'] ?? false) ? ToolCallStatus::Succeeded : ToolCallStatus::Failed);
        $result = $outcome['result'] ?? null;
        $toolCall->forceFill([
            'status' => $status,
            'result' => is_array($result) ? $result : (isset($outcome['output']) ? ['output' => $outcome['output']] : null),
            'error' => $status === ToolCallStatus::Succeeded ? null : str($outcome['error'] ?? 'The action failed.')->limit(4000)->value(),
            'duration_ms' => $outcome['duration_ms'] ?? null,
        ])->save();

        $name = $action->name;

        return match ($status) {
            ToolCallStatus::Succeeded => back()->with('success', "Approved. {$name} ran."),
            ToolCallStatus::Timeout => back()->with('warning', "Approved, but {$name} did not answer in time. It may or may not have happened: check the system it writes to."),
            default => back()->with('error', "Approved, but {$name} failed: ".str($outcome['error'] ?? 'no detail')->limit(200)),
        };
    }

    public function reject(ToolCall $toolCall): RedirectResponse
    {
        if (! $this->claim($toolCall, ToolCallStatus::Rejected, error: 'Rejected by '.(Auth::user()?->name ?? 'a person').'.')) {
            return back()->with('warning', 'Someone has already decided this request.');
        }

        return back()->with('success', 'Rejected. The action did not run.');
    }

    /** Move a request out of `awaiting_approval`, once. False when someone else got there first. */
    private function claim(ToolCall $toolCall, ToolCallStatus $to, ?string $error = null): bool
    {
        $fields = ['status' => $to->value, 'approved_by_id' => Auth::id(), 'approved_at' => now(), 'updated_at' => now()];
        if ($error !== null) {
            $fields['error'] = $error;
        }
        $claimed = ToolCall::query()->whereKey($toolCall->id)->where('status', ToolCallStatus::AwaitingApproval->value)->update($fields) === 1;
        if ($claimed) {
            $toolCall->refresh();
        }

        return $claimed;
    }

    /**
     * The arguments the agent asked for. A built-in action on a call also
     * gets the conversation and the contact it belonged to, which a live
     * call supplies on its own and an approval, run later, does not.
     */
    private function arguments(ToolCall $toolCall, Action $action): array
    {
        $arguments = $toolCall->arguments ?? [];
        if ($action->kind === ActionKind::Internal && $toolCall->call) {
            $arguments['conversation_id'] ??= $toolCall->call->conversation_id;
            if ($toolCall->call->contact_id) {
                $arguments['contact_id'] ??= $toolCall->call->contact_id;
            }
        }

        return $arguments;
    }
}
