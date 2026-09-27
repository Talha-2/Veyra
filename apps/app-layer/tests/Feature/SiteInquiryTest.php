<?php

namespace Tests\Feature;

use App\Models\SiteInquiry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The company website's contact form: stored, validated field by field, bots told nothing. */
class SiteInquiryTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_demo_request_is_stored_without_the_raw_ip(): void
    {
        $this->postJson('/api/site/inquiries', [
            'name' => 'Priya Nair', 'email' => 'Priya@NairDental.example', 'company' => 'Nair Dental',
            'phone' => '+1 (312) 555-0100', 'topic' => 'demo', 'message' => 'We miss calls at lunch.', 'page' => '/start',
        ])->assertCreated()->assertExactJson(['ok' => true]);

        $inquiry = SiteInquiry::sole();
        $this->assertSame('priya@nairdental.example', $inquiry->email);
        $this->assertSame('demo', $inquiry->topic);
        $this->assertNotNull($inquiry->ip_hash);
        $this->assertStringNotContainsString('127.0.0.1', $inquiry->ip_hash);
    }

    public function test_errors_come_back_per_field_for_the_site_to_show(): void
    {
        $this->postJson('/api/site/inquiries', ['name' => '', 'email' => 'not-an-email', 'topic' => 'lunch', 'phone' => 'call me'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'email', 'topic', 'phone']);

        $this->assertSame(0, SiteInquiry::count());
    }

    public function test_the_honeypot_answers_like_success_and_stores_nothing(): void
    {
        $this->postJson('/api/site/inquiries', ['name' => 'Bot', 'email' => 'bot@x.example', 'topic' => 'demo', 'website' => 'http://spam.example'])
            ->assertCreated();

        $this->assertSame(0, SiteInquiry::count());
    }

    public function test_the_site_origin_is_allowed_by_cors(): void
    {
        $this->withHeaders(['Origin' => 'http://localhost:3210', 'Access-Control-Request-Method' => 'POST', 'Access-Control-Request-Headers' => 'content-type'])
            ->options('/api/site/inquiries')
            ->assertHeader('Access-Control-Allow-Origin');
    }

    public function test_the_form_is_throttled_per_address(): void
    {
        foreach (range(1, 6) as $i) {
            $this->postJson('/api/site/inquiries', ['name' => "N{$i}", 'email' => "n{$i}@x.example", 'topic' => 'sales'])->assertCreated();
        }
        $this->postJson('/api/site/inquiries', ['name' => 'N7', 'email' => 'n7@x.example', 'topic' => 'sales'])->assertStatus(429);
    }
}
