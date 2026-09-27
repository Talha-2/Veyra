<?php

namespace App\Enums;

/**
 * What a member may do inside one organization.
 *
 * Role supplies the *default* surface access for a new membership; it does not
 * determine it. Surface access lives on the membership itself, so an owner can
 * give someone Studio without making them an admin, or take Studio away from an
 * admin, without either becoming a new role.
 */
enum OrganizationRole: string
{
    case Owner = 'owner';
    case Admin = 'admin';
    case Member = 'member';

    public function label(): string
    {
        return match ($this) {
            self::Owner => 'Owner',
            self::Admin => 'Admin',
            self::Member => 'Member',
        };
    }

    /**
     * The surfaces a new membership with this role gets by default.
     *
     * Members are Desk-only on purpose: Studio changes how the agent behaves on
     * live calls, which is a different kind of permission from working an inbox.
     *
     * @return list<Surface>
     */
    public function defaultSurfaces(): array
    {
        return match ($this) {
            self::Owner, self::Admin => [Surface::Desk, Surface::Studio],
            self::Member => [Surface::Desk],
        };
    }

    /** Whether this role may change the organization itself: members, billing, deletion. */
    public function administersOrganization(): bool
    {
        return $this === self::Owner || $this === self::Admin;
    }
}
