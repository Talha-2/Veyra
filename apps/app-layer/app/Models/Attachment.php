<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

#[Fillable(['message_id', 'disk', 'path', 'filename', 'mime', 'size_bytes'])]
class Attachment extends Model
{
    use BelongsToTenant;

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    /**
     * A time-limited link rather than a public URL.
     *
     * Attachments are customer documents — invoices, IDs, medical forms. A
     * permanent public URL leaks them to anyone who ever sees one.
     */
    public function temporaryUrl(): string
    {
        return Storage::disk($this->disk)->temporaryUrl($this->path, now()->addMinutes(15));
    }
}
