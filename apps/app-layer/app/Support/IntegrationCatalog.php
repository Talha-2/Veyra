<?php

namespace App\Support;

use App\Services\Composio\ComposioClient;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The app catalog Studio browses to connect an external tool.
 *
 * Live from Composio when `COMPOSIO_API_KEY` is set — 1,500+ toolkits, their
 * tools and their auth schemes, read through ComposioClient and cached. The
 * curated list below is the fallback when there is no key or Composio is
 * unreachable, and the page says which it is showing rather than letting a
 * stub pass for the real thing.
 */
class IntegrationCatalog
{
    /** Toolkits a service business reaches for first; pinned to the top of the live list too. */
    public const POPULAR = ['googlecalendar', 'gmail', 'hubspot', 'stripe', 'slack', 'googlesheets', 'calendly', 'jobber', 'notion', 'zendesk'];

    public static function configured(): bool
    {
        return app(ComposioClient::class)->configured();
    }

    /**
     * Whether the last live read worked. Studio shows the curated list with a
     * warning when the key is set but Composio did not answer.
     */
    public static function live(): bool
    {
        return self::configured() && ! cache()->has('composio:down');
    }

    /** @return list<array{slug:string,name:string,category:string,description:string,auth:string,popular:bool,logo:?string,tools_count:?int}> */
    public static function apps(?string $search = null, ?string $category = null): array
    {
        if (self::configured()) {
            try {
                $items = app(ComposioClient::class)->toolkits($search, $category)['items'];
                cache()->forget('composio:down');

                return collect($items)->map(fn ($t) => self::fromToolkit($t))->filter()->values()->all();
            } catch (Throwable $e) {
                Log::warning('composio.catalog_unavailable', ['error' => $e->getMessage()]);
                cache()->put('composio:down', true, now()->addMinutes(5));
            }
        }

        $q = mb_strtolower((string) $search);

        return collect(self::curated())
            ->when($q, fn ($c) => $c->filter(fn ($a) => str_contains(mb_strtolower($a['name'].' '.$a['description']), $q)))
            ->when($category, fn ($c) => $c->where('category', $category))
            ->values()->all();
    }

    /**
     * The categories worth filtering by: those of the most-used toolkits,
     * not Composio's full taxonomy (826 names, most with one toolkit).
     */
    public static function categories(): array
    {
        if (self::live()) {
            try {
                $apps = self::apps();

                return collect($apps)->pluck('category')->countBy()->sortDesc()->keys()->take(14)->values()->all();
            } catch (Throwable) {
                // fall through to the curated list
            }
        }

        return array_values(array_unique(array_column(self::curated(), 'category')));
    }

    public static function find(string $slug): ?array
    {
        if (self::configured()) {
            try {
                $toolkit = app(ComposioClient::class)->toolkit($slug);

                return $toolkit ? self::fromToolkit($toolkit) : null;
            } catch (Throwable $e) {
                Log::warning('composio.toolkit_unavailable', ['slug' => $slug, 'error' => $e->getMessage()]);
            }
        }

        foreach (self::curated() as $app) {
            if ($app['slug'] === $slug) {
                return $app;
            }
        }

        return null;
    }

    /**
     * The tools a toolkit exposes, with the reliability flag the harness
     * needs. Live: Composio's tool list, `durable` inferred from the slug's
     * verb (CREATE/UPDATE/DELETE/SEND… write; everything else reads). The
     * inference is a default the person can correct on the Actions page.
     *
     * @return list<array{slug:string,name:string,description:string,durable:bool,parameters:?array}>
     */
    public static function tools(string $slug): array
    {
        if (self::configured()) {
            try {
                return collect(app(ComposioClient::class)->tools($slug))->map(fn ($t) => [
                    'slug' => $t['slug'],
                    'name' => $t['name'] ?? str($t['slug'])->after('_')->replace('_', ' ')->lower()->ucfirst()->value(),
                    'description' => str($t['description'] ?? '')->limit(300)->value(),
                    'durable' => self::isWrite($t['slug']),
                    'parameters' => $t['input_parameters'] ?? null,
                ])->all();
            } catch (Throwable $e) {
                Log::warning('composio.tools_unavailable', ['slug' => $slug, 'error' => $e->getMessage()]);
            }
        }

        return self::curatedTools($slug);
    }

    public static function isWrite(string $toolSlug): bool
    {
        return (bool) preg_match('/(CREATE|UPDATE|DELETE|SEND|INSERT|PATCH|REMOVE|ADD|POST|SET|MOVE|ARCHIVE|REPLY|UPLOAD|WRITE|CANCEL|BOOK|SCHEDULE|CHARGE|REFUND|PAY|INVITE|ASSIGN|MARK|TRASH|CLEAR|BULK)/', strtoupper($toolSlug));
    }

    private static function fromToolkit(array $t): ?array
    {
        $slug = $t['slug'] ?? null;
        if (! $slug) {
            return null;
        }
        $meta = $t['meta'] ?? [];
        $managed = ! empty($t['composio_managed_auth_schemes']);
        // The list view carries `auth_schemes`; the detail view `auth_config_details`.
        $modes = collect($t['auth_config_details'] ?? [])->pluck('mode')->merge($t['auth_schemes'] ?? [])->filter()->unique()->values();
        $auth = $managed || $modes->contains('OAUTH2') ? 'oauth' : ($modes->contains('API_KEY') || $modes->contains('BEARER_TOKEN') ? 'api_key' : ($t['no_auth'] ?? false ? 'none' : 'oauth'));

        return [
            'slug' => $slug,
            'name' => $t['name'] ?? $slug,
            'category' => $meta['categories'][0]['name'] ?? $meta['categories'][0]['id'] ?? 'Other',
            'description' => str($meta['description'] ?? $t['description'] ?? '')->limit(160)->value(),
            'auth' => $auth,
            'managed_auth' => $managed,
            'popular' => in_array($slug, self::POPULAR, true),
            'logo' => $meta['logo'] ?? $t['logo'] ?? null,
            'tools_count' => $meta['tools_count'] ?? $t['tools_count'] ?? null,
        ];
    }

    // ── curated fallback ────────────────────────────────────────────────

    public static function curated(): array
    {
        return [
            ['slug' => 'googlecalendar', 'name' => 'Google Calendar', 'category' => 'Scheduling', 'description' => 'Read availability and book appointments.', 'auth' => 'oauth', 'popular' => true, 'logo' => null, 'tools_count' => null],
            ['slug' => 'calendly', 'name' => 'Calendly', 'category' => 'Scheduling', 'description' => 'Offer booking links and confirm slots.', 'auth' => 'oauth', 'popular' => true, 'logo' => null, 'tools_count' => null],
            ['slug' => 'gmail', 'name' => 'Gmail', 'category' => 'Email', 'description' => 'Send and read email from a connected inbox.', 'auth' => 'oauth', 'popular' => true, 'logo' => null, 'tools_count' => null],
            ['slug' => 'outlook', 'name' => 'Outlook', 'category' => 'Email', 'description' => 'Send and read email from a Microsoft mailbox.', 'auth' => 'oauth', 'popular' => false, 'logo' => null, 'tools_count' => null],
            ['slug' => 'hubspot', 'name' => 'HubSpot', 'category' => 'CRM', 'description' => 'Create and update contacts and deals.', 'auth' => 'oauth', 'popular' => true, 'logo' => null, 'tools_count' => null],
            ['slug' => 'salesforce', 'name' => 'Salesforce', 'category' => 'CRM', 'description' => 'Look up and update leads, accounts, cases.', 'auth' => 'oauth', 'popular' => false, 'logo' => null, 'tools_count' => null],
            ['slug' => 'stripe', 'name' => 'Stripe', 'category' => 'Payments', 'description' => 'Take deposits, check invoices, issue refunds.', 'auth' => 'api_key', 'popular' => true, 'logo' => null, 'tools_count' => null],
            ['slug' => 'square', 'name' => 'Square', 'category' => 'Payments', 'description' => 'Charge cards and look up transactions.', 'auth' => 'oauth', 'popular' => false, 'logo' => null, 'tools_count' => null],
            ['slug' => 'slack', 'name' => 'Slack', 'category' => 'Messaging', 'description' => 'Post to channels and DMs.', 'auth' => 'oauth', 'popular' => true, 'logo' => null, 'tools_count' => null],
            ['slug' => 'notion', 'name' => 'Notion', 'category' => 'Knowledge', 'description' => 'Read pages and databases.', 'auth' => 'oauth', 'popular' => false, 'logo' => null, 'tools_count' => null],
            ['slug' => 'googlesheets', 'name' => 'Google Sheets', 'category' => 'Data', 'description' => 'Append rows and read tables.', 'auth' => 'oauth', 'popular' => true, 'logo' => null, 'tools_count' => null],
            ['slug' => 'airtable', 'name' => 'Airtable', 'category' => 'Data', 'description' => 'Read and write base records.', 'auth' => 'api_key', 'popular' => false, 'logo' => null, 'tools_count' => null],
            ['slug' => 'zendesk', 'name' => 'Zendesk', 'category' => 'Support', 'description' => 'Create and update support tickets.', 'auth' => 'oauth', 'popular' => false, 'logo' => null, 'tools_count' => null],
            ['slug' => 'jobber', 'name' => 'Jobber', 'category' => 'Field service', 'description' => 'Schedule jobs and manage quotes for home services.', 'auth' => 'oauth', 'popular' => true, 'logo' => null, 'tools_count' => null],
            ['slug' => 'servicetitan', 'name' => 'ServiceTitan', 'category' => 'Field service', 'description' => 'Dispatch, jobs and customer records.', 'auth' => 'api_key', 'popular' => false, 'logo' => null, 'tools_count' => null],
            ['slug' => 'twilio', 'name' => 'Twilio', 'category' => 'Telephony', 'description' => 'Send SMS outside the connected line.', 'auth' => 'api_key', 'popular' => false, 'logo' => null, 'tools_count' => null],
        ];
    }

    private static function curatedTools(string $slug): array
    {
        $rows = match ($slug) {
            'googlecalendar', 'calendly' => [
                ["{$slug}_find_free_slots", 'Find free slots', 'List available windows in a date range.', false],
                ["{$slug}_create_event", 'Create event', 'Book a slot with attendees and a description.', true],
                ["{$slug}_update_event", 'Update event', 'Move or edit an existing booking.', true],
                ["{$slug}_cancel_event", 'Cancel event', 'Cancel a booking.', true],
            ],
            'gmail', 'outlook' => [
                ["{$slug}_send_email", 'Send email', 'Send from the connected mailbox.', true],
                ["{$slug}_search", 'Search mail', 'Find messages by query.', false],
            ],
            'hubspot', 'salesforce', 'zendesk' => [
                ["{$slug}_find_contact", 'Find contact', 'Look up by email or phone.', false],
                ["{$slug}_create_contact", 'Create contact', 'Create a record.', true],
                ["{$slug}_update_contact", 'Update contact', 'Change fields on a record.', true],
            ],
            'stripe', 'square' => [
                ["{$slug}_create_payment", 'Take payment', 'Charge a card or take a deposit.', true],
                ["{$slug}_lookup_customer", 'Look up customer', 'Find payment history.', false],
            ],
            default => [
                ["{$slug}_read", 'Read', 'Read records.', false],
                ["{$slug}_write", 'Write', 'Create or update records.', true],
            ],
        };

        return array_map(fn ($r) => ['slug' => $r[0], 'name' => $r[1], 'description' => $r[2], 'durable' => $r[3], 'parameters' => null], $rows);
    }
}
