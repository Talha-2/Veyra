<?php

namespace Tests;

use App\Models\Organization;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Clear the tenant between tests.
     *
     * Organization holds a static cache and an explicit override, and statics
     * outlive a test. The cache is keyed by id so it cannot go stale on its
     * own, but an override set by one test would otherwise silently pin the
     * tenant for every test after it in the same process.
     */
    protected function setUp(): void
    {
        parent::setUp();

        Organization::forget();
    }

    protected function tearDown(): void
    {
        Organization::forget();

        parent::tearDown();
    }
}
