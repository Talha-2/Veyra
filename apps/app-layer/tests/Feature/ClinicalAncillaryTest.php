<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\ClinicalEncounter;
use App\Models\DiagnosticOrder;
use App\Models\Patient;
use App\Models\PatientDocument;
use App\Models\PatientReferral;
use App\Models\Provider;
use App\Services\Healthcare\ClinicalAncillary;
use App\Services\Healthcare\PatientRegistry;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\HealthcareTestCase;

class ClinicalAncillaryTest extends HealthcareTestCase
{
    private Patient $patient;

    private Provider $provider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->provider = Provider::create(['name' => 'Dr Sara', 'user_id' => $this->owner->id]);
        $this->patient = app(PatientRegistry::class)->register(['name' => 'Ayesha'], $this->owner);
    }

    private function order(): DiagnosticOrder
    {
        $this->post('/desk/diagnostics', ['patient_id' => $this->patient->id, 'kind' => 'lab', 'name' => 'CBC', 'indication' => 'Fatigue', 'priority' => 'routine'])->assertRedirect();

        return DiagnosticOrder::firstOrFail();
    }

    public function test_order_result_review_preserves_completed_history(): void
    {
        $order = $this->order();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 1, 'action' => 'order'])->assertRedirect();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 2, 'action' => 'result', 'result' => 'Within reference range', 'result_flag' => 'normal'])->assertRedirect();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 3, 'action' => 'review', 'review_note' => 'Discussed at follow-up'])->assertRedirect();
        $this->assertSame('reviewed', $order->fresh()->status);
        $this->assertSame($this->owner->id, $order->fresh()->reviewed_by);
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 4, 'action' => 'result', 'result' => 'Rewritten', 'result_flag' => 'normal'])->assertSessionHasErrors('action');
        $this->assertSame('Within reference range', $order->fresh()->result);
        $this->get('/desk/labs?patient_id='.$this->patient->id)->assertOk()->assertInertia(fn (Assert $page) => $page->component('desk/diagnostics')->has('records.data', 1));
        $this->get('/desk/images')->assertOk()->assertInertia(fn (Assert $page) => $page->has('records.data', 0));
    }

    public function test_invalid_and_stale_transitions_do_not_change_order(): void
    {
        $order = $this->order();
        $url = '/desk/diagnostics/'.$order->id.'/transition';
        $this->post($url, ['version' => 1, 'action' => 'review'])->assertSessionHasErrors('action');
        $this->post($url, ['version' => 1, 'action' => 'order'])->assertRedirect();
        $this->post($url, ['version' => 1, 'action' => 'cancel', 'reason' => 'Stale'])->assertSessionHasErrors('version');
        $this->post($url, ['version' => 2, 'action' => 'result', 'result' => '', 'result_flag' => 'abnormal'])->assertSessionHasErrors('result');
        $this->assertSame('ordered', $order->fresh()->status);
    }

    public function test_staff_and_other_authors_cannot_access_drafts_or_mutate_orders(): void
    {
        $order = $this->order();
        $this->provider->update(['active' => false]);
        foreach (['labs', 'images', 'documents', 'referrals'] as $module) {
            $this->get('/desk/'.$module)->assertForbidden();
        }
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 1, 'action' => 'order'])->assertForbidden();
        Provider::create(['name' => 'Another doctor', 'user_id' => $this->owner->id]);
        $this->get('/desk/labs')->assertInertia(fn (Assert $page) => $page->has('records.data', 0));
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 1, 'action' => 'order'])->assertForbidden();
    }

    public function test_encounter_context_must_match_patient_and_clinical_access(): void
    {
        $other = app(PatientRegistry::class)->register(['name' => 'Other patient'], $this->owner);
        $encounter = ClinicalEncounter::create(['patient_id' => $other->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Dr Sara', 'author_name' => 'Owner', 'occurred_at' => now()]);
        $this->post('/desk/diagnostics', ['patient_id' => $this->patient->id, 'clinical_encounter_id' => $encounter->id, 'kind' => 'imaging', 'name' => 'Chest X-ray', 'indication' => 'Cough', 'priority' => 'routine'])->assertSessionHasErrors('clinical_encounter_id');
        $encounter->update(['patient_id' => $this->patient->id, 'provider_id' => Provider::create(['name' => 'Unlinked doctor'])->id]);
        $this->post('/desk/diagnostics', ['patient_id' => $this->patient->id, 'clinical_encounter_id' => $encounter->id, 'kind' => 'lab', 'name' => 'CBC', 'indication' => 'Fatigue', 'priority' => 'routine'])->assertForbidden();
    }

    public function test_documents_are_private_validated_and_download_guarded(): void
    {
        Storage::fake('local');
        $file = UploadedFile::fake()->createWithContent('report.pdf', "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
        $this->post('/desk/documents', ['patient_id' => $this->patient->id, 'title' => 'Lab report', 'category' => 'lab_report', 'file' => $file])->assertRedirect();
        $document = PatientDocument::firstOrFail();
        Storage::disk('local')->assertExists($document->storage_path);
        $this->get('/desk/documents/'.$document->id.'/download')->assertDownload('report.pdf');
        $this->get('/desk/documents')->assertInertia(fn (Assert $page) => $page->component('desk/documents')->missing('records.data.0.storage_path')->has('records.data', 1));
        $this->post('/desk/documents', ['patient_id' => $this->patient->id, 'title' => 'Bad file', 'category' => 'other', 'file' => UploadedFile::fake()->createWithContent('evil.php', '<?php echo 1;')])->assertSessionHasErrors('file');
        $this->provider->update(['active' => false]);
        $this->get('/desk/documents/'.$document->id.'/download')->assertForbidden();
    }

    public function test_referral_issue_revoke_keeps_letter_and_records_actor(): void
    {
        $this->post('/desk/referrals', ['patient_id' => $this->patient->id, 'recipient' => 'Dr Hamza, Cardiology', 'reason' => 'Specialist assessment', 'letter' => 'Please assess ongoing symptoms.'])->assertRedirect();
        $referral = PatientReferral::firstOrFail();
        $this->post('/desk/referrals/'.$referral->id.'/transition', ['action' => 'issue', 'version' => 1])->assertRedirect();
        $this->post('/desk/referrals/'.$referral->id.'/transition', ['action' => 'revoke', 'version' => 2, 'reason' => 'Referral superseded'])->assertRedirect();
        $this->assertSame('revoked', $referral->fresh()->status);
        $this->assertSame('Please assess ongoing symptoms.', $referral->fresh()->letter);
        $this->assertSame($this->owner->id, $referral->fresh()->revoked_by);
        $this->post('/desk/referrals/'.$referral->id.'/transition', ['action' => 'issue', 'version' => 3])->assertSessionHasErrors('action');
        $this->get('/desk/referrals')->assertOk()->assertInertia(fn (Assert $page) => $page->component('desk/referrals')->has('records.data', 1));
    }

    public function test_drafts_can_be_corrected_but_issued_details_are_immutable(): void
    {
        $order = $this->order();
        $data = ['version' => 1, 'name' => 'CBC with differential', 'indication' => 'Persistent fatigue', 'priority' => 'urgent'];
        $this->patch('/desk/diagnostics/'.$order->id, $data)->assertRedirect();
        $this->assertSame('CBC with differential', $order->fresh()->name);
        $this->patch('/desk/diagnostics/'.$order->id, $data)->assertSessionHasErrors('version');
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 2, 'action' => 'order'])->assertRedirect();
        $this->patch('/desk/diagnostics/'.$order->id, [...$data, 'version' => 3])->assertSessionHasErrors('record');
        $this->post('/desk/referrals', ['patient_id' => $this->patient->id, 'recipient' => 'Cardiology', 'reason' => 'Assessment', 'letter' => 'Draft letter'])->assertRedirect();
        $referral = PatientReferral::firstOrFail();
        $referralData = ['version' => 1, 'recipient' => 'Dr Hamza', 'reason' => 'Cardiology assessment', 'letter' => 'Final reviewed letter'];
        $this->patch('/desk/referrals/'.$referral->id, $referralData)->assertRedirect();
        $this->post('/desk/referrals/'.$referral->id.'/transition', ['version' => 2, 'action' => 'issue'])->assertRedirect();
        $this->patch('/desk/referrals/'.$referral->id, [...$referralData, 'version' => 3, 'letter' => 'Replacement'])->assertSessionHasErrors('record');
        $this->assertSame('Final reviewed letter', $referral->fresh()->letter);
    }

    public function test_document_encounter_access_is_enforced_on_lists_and_downloads(): void
    {
        Storage::fake('local');
        $encounter = ClinicalEncounter::create(['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Dr Sara', 'author_name' => 'Owner', 'occurred_at' => now()]);
        $this->post('/desk/documents', ['patient_id' => $this->patient->id, 'clinical_encounter_id' => $encounter->id, 'title' => 'Draft consultation report', 'category' => 'outside_record', 'file' => UploadedFile::fake()->createWithContent('report.pdf', "%PDF-1.4\n%%EOF")])->assertRedirect();
        $document = PatientDocument::firstOrFail();
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Other clinician', 'user_id' => $this->owner->id]);
        $this->get('/desk/documents')->assertInertia(fn (Assert $page) => $page->has('records.data', 0));
        $this->get('/desk/documents/'.$document->id.'/download')->assertForbidden();
        $encounter->update(['status' => 'signed', 'signed_at' => now()]);
        $this->get('/desk/documents/'.$document->id.'/download')->assertDownload();
        $document->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/desk/documents/'.$document->id.'/download')->assertNotFound();
    }

    public function test_document_size_and_extension_must_be_safe_and_patient_search_is_scoped(): void
    {
        Storage::fake('local');
        $this->post('/desk/documents', ['patient_id' => $this->patient->id, 'title' => 'Too large', 'category' => 'other', 'file' => UploadedFile::fake()->create('huge.pdf', 10241, 'application/pdf')])->assertSessionHasErrors('file');
        $this->post('/desk/documents', ['patient_id' => $this->patient->id, 'title' => 'Disguised', 'category' => 'other', 'file' => UploadedFile::fake()->createWithContent('evil.php', "%PDF-1.4\n%%EOF")])->assertSessionHasErrors('file');
        $this->assertSame(0, PatientDocument::count());
        $this->get('/desk/documents?q=Ayesha')->assertOk()->assertInertia(fn (Assert $page) => $page->has('patients', 1));
        $this->get('/desk/documents?q=Nobody')->assertOk()->assertInertia(fn (Assert $page) => $page->has('patients', 0));
    }

    public function test_clinical_list_access_is_audited_without_clinical_content(): void
    {
        $this->order();
        $this->get('/desk/labs?patient_id='.$this->patient->id)->assertOk();
        $this->assertDatabaseHas('activities', ['type' => 'clinical.ancillary_viewed', 'user_id' => $this->owner->id]);
        $event = Activity::where('type', 'clinical.ancillary_viewed')->firstOrFail();
        $this->assertStringNotContainsString('Fatigue', json_encode($event->toArray()));
    }

    public function test_cancelled_unissued_orders_remain_private_to_the_original_author(): void
    {
        $order = $this->order();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 1, 'action' => 'cancel', 'reason' => 'Draft entered in error'])->assertRedirect();
        $this->get('/desk/labs')->assertInertia(fn (Assert $page) => $page->has('records.data', 1));
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Other clinician', 'user_id' => $this->owner->id]);
        $this->get('/desk/labs')->assertInertia(fn (Assert $page) => $page->has('records.data', 0));
        try {
            app(ClinicalAncillary::class)->assertRead($order->fresh(), $this->owner);
            $this->fail('A cancelled, never-issued draft must not be readable by another provider.');
        } catch (HttpException $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
    }

    public function test_shared_visibility_requires_issuance_and_encounter_dropdowns_hide_private_drafts(): void
    {
        $order = $this->order();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 1, 'action' => 'order'])->assertRedirect();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 2, 'action' => 'cancel', 'reason' => 'No longer needed'])->assertRedirect();
        $this->post('/desk/referrals', ['patient_id' => $this->patient->id, 'recipient' => 'Cardiology', 'reason' => 'Assessment', 'letter' => 'Issued letter'])->assertRedirect();
        $issued = PatientReferral::firstOrFail();
        $this->post('/desk/referrals/'.$issued->id.'/transition', ['version' => 1, 'action' => 'issue'])->assertRedirect();
        $this->post('/desk/referrals/'.$issued->id.'/transition', ['version' => 2, 'action' => 'revoke', 'reason' => 'Superseded'])->assertRedirect();
        $private = PatientReferral::create(['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Dr Sara', 'author_name' => 'Owner', 'recipient' => 'Private recipient', 'reason' => 'Private reason', 'letter' => 'Never issued', 'status' => 'revoked']);
        ClinicalEncounter::create(['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Dr Sara', 'author_name' => 'Owner', 'chief_complaint' => 'Private draft complaint', 'occurred_at' => now()]);
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Other clinician', 'user_id' => $this->owner->id]);
        $this->get('/desk/labs')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.id', $order->id));
        $this->get('/desk/referrals')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.id', $issued->id));
        foreach (['labs', 'images', 'documents', 'referrals'] as $module) {
            $this->get('/desk/'.$module.'?patient_id='.$this->patient->id)->assertInertia(fn (Assert $page) => $page->has('encounters', 0));
        }
        try {
            app(ClinicalAncillary::class)->assertRead($private, $this->owner);
            $this->fail('A revoked referral without issuance must not be shared.');
        } catch (HttpException $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
    }

    public function test_cross_tenant_records_and_patient_context_are_not_accessible(): void
    {
        $order = $this->order();
        $order->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['action' => 'order', 'version' => 1])->assertNotFound();
        $this->patient->forceFill(['organization_id' => $order->organization_id])->save();
        $this->get('/desk/labs?patient_id='.$this->patient->id)->assertNotFound();
    }
}
