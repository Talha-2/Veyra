<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_guest_is_sent_to_sign_in(): void
    {
        $this->get('/')->assertRedirect('/login');
    }

    public function test_the_sign_in_page_renders(): void
    {
        $this->get('/login')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('auth/login'));
    }

    public function test_both_product_surfaces_require_authentication(): void
    {
        $this->get('/desk')->assertRedirect('/login');
        $this->get('/studio')->assertRedirect('/login');
    }
}
