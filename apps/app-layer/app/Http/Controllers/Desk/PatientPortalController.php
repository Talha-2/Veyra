<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientPortalAccess;
use App\Models\PatientPortalInvitation;
use App\Models\User;
use App\Services\Healthcare\ClinicalRecords;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class PatientPortalController extends Controller
{
    private function authorizeStaff(Request $request): void
    {
        abort_unless($request->user()->can('administer-organization') || app(ClinicalRecords::class)->canAccess($request->user()), 403);
    }

    public function index(Request $request, Patient $patient): Response
    {
        $this->authorizeStaff($request);
        $accesses = PatientPortalAccess::where('organization_id', Organization::currentId())->where('patient_id', $patient->id)->get();
        $users = User::whereIn('id', $accesses->pluck('user_id'))->get()->keyBy('id');

        return Inertia::render('desk/patient-portal', ['patient' => ['id' => $patient->id, 'name' => $patient->contact?->displayName(), 'mrn' => $patient->mrn, 'status' => $patient->status],
            'can_manage' => $request->user()->can('administer-organization'),
            'invitation_url' => $request->session()->get('patient_portal_invitation_url'),
            'invitations' => PatientPortalInvitation::where('patient_id', $patient->id)->whereNull('redeemed_at')->whereNull('revoked_at')->where('expires_at', '>', now())->latest()->get(['id', 'email', 'share_clinical', 'expires_at']),
            'accesses' => $accesses->map(fn ($access) => ['id' => $access->id, 'email' => $users->get($access->user_id)?->email, 'name' => $users->get($access->user_id)?->name, 'share_clinical' => $access->share_clinical, 'revoked_at' => $access->revoked_at?->toIso8601String(), 'expires_at' => $access->expires_at?->toIso8601String()])]);
    }

    public function invite(Request $request, Patient $patient): RedirectResponse
    {
        $this->authorizeStaff($request);
        $data = $request->validate(['email' => ['required', 'email', 'max:255'], 'share_clinical' => ['sometimes', 'boolean']]);
        $token = Str::random(64);
        DB::transaction(function () use ($patient, $request, $data, $token) {
            $locked = Patient::lockForUpdate()->findOrFail($patient->id);
            if ($locked->status !== 'active') {
                throw ValidationException::withMessages(['patient' => 'Restore this patient before inviting portal access.']);
            }
            $email = mb_strtolower(trim($data['email']));
            PatientPortalInvitation::where('patient_id', $patient->id)->where('email', $email)->whereNull('redeemed_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);
            PatientPortalInvitation::create(['patient_id' => $patient->id, 'email' => $email, 'token_hash' => hash('sha256', $token), 'share_clinical' => $data['share_clinical'] ?? false, 'expires_at' => now()->addDays(7), 'invited_by' => $request->user()->id]);
            Activity::log($patient, 'portal.invited', 'Patient portal invitation created', $request->user());
        });

        return back()->with('patient_portal_invitation_url', route('portal.invitation', ['token' => $token]))->with('success', 'Invitation link created. Copy it now; it will only be shown once.');
    }

    private function access(Patient $patient, int $id): PatientPortalAccess
    {
        return PatientPortalAccess::where('organization_id', Organization::currentId())->where('patient_id', $patient->id)->findOrFail($id);
    }

    public function sharing(Request $request, Patient $patient, int $access): RedirectResponse
    {
        $data = $request->validate(['share_clinical' => ['required', 'boolean'], 'expires_at' => ['sometimes', 'nullable', 'date', 'after:now']]);
        $this->access($patient, $access)->update($data);
        Activity::log($patient, 'portal.sharing_updated', 'Patient portal clinical sharing updated', $request->user());

        return back()->with('success', 'Portal sharing and expiry saved.');
    }

    public function revoke(Request $request, Patient $patient, int $access): RedirectResponse
    {
        $grant = $this->access($patient, $access);
        DB::transaction(function () use ($grant, $patient, $request) {
            $grant->update(['revoked_at' => now()]);
            $email = User::find($grant->user_id)?->email;
            if ($email) {
                PatientPortalInvitation::where('patient_id', $patient->id)->where('email', mb_strtolower(trim($email)))->whereNull('redeemed_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);
            }
            Activity::log($patient, 'portal.revoked', 'Patient portal access revoked', $request->user());
        });

        return back()->with('success', 'Portal access revoked.');
    }

    public function revokeInvitation(Request $request, Patient $patient, PatientPortalInvitation $invitation): RedirectResponse
    {
        abort_unless($invitation->patient_id === $patient->id, 404);
        $invitation->update(['revoked_at' => now()]);
        Activity::log($patient, 'portal.invitation_revoked', 'Patient portal invitation revoked', $request->user());

        return back()->with('success', 'Invitation revoked.');
    }
}
