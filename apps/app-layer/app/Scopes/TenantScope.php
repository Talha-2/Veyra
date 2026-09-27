<?php

namespace App\Scopes;

use App\Models\Organization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Filters every query on a tenant-owned model to the active organization.
 *
 * This is the reason "forgot to scope by organization" is not a class of bug in
 * this codebase. It applies automatically; bypassing it is explicit and
 * greppable:
 *
 *     Model::withoutGlobalScope(TenantScope::class)->...
 *
 * **When there is no active organization it fails closed over HTTP** — the query
 * matches nothing rather than every tenant. A missing tenant on a web request is
 * a routing or middleware bug, and returning another tenant's rows is the worst
 * available response to it.
 *
 * In the console it does not filter at all, because migrations, seeders and
 * maintenance commands legitimately operate across tenants. **Queued jobs also
 * run in console context**, so a job that touches tenant data must set the
 * tenant itself:
 *
 *     Organization::setCurrent($organization);
 *
 * Nothing enforces that. It is the one place tenancy here relies on discipline.
 *
 * The test runner is a console process too, but tests exercise HTTP behaviour,
 * so they get the HTTP rule. Without that carve-out a tenancy test can only
 * ever pass — the scope would let everything through — which is exactly how a
 * cross-tenant read went unnoticed until a test asserted a 404 and got a 200.
 */
class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $organizationId = Organization::currentId();

        if ($organizationId !== null) {
            $builder->where($model->getQualifiedTenantColumn(), $organizationId);

            return;
        }

        if (! app()->runningInConsole() || app()->runningUnitTests()) {
            $builder->whereRaw('1 = 0');
        }
    }
}
