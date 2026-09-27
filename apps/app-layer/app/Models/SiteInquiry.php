<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A demo or contact request sent from the company website. Not tenant-scoped. */
class SiteInquiry extends Model
{
    public const TOPICS = ['demo', 'sales', 'support', 'other'];

    protected $fillable = ['name', 'email', 'company', 'phone', 'topic', 'message', 'page', 'ip_hash', 'user_agent', 'handled_at'];

    protected function casts(): array
    {
        return ['handled_at' => 'datetime'];
    }
}
