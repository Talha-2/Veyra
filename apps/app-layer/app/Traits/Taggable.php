<?php

namespace App\Traits;

use App\Models\Tag;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

trait Taggable
{
    public function tags(): MorphToMany
    {
        return $this->morphToMany(Tag::class, 'taggable')->withTimestamps();
    }

    /**
     * Replace this model's tags, creating any that do not exist yet.
     *
     * Tags are created on use rather than managed up front — nobody wants a
     * "create tag" step before they can label a contact. `firstOrCreate` on the
     * tenant-unique name is what makes that safe under concurrency.
     *
     * @param  list<string>  $names
     */
    public function syncTags(array $names): void
    {
        $ids = collect($names)
            ->map(fn (string $name) => trim($name))
            ->filter()
            ->unique()
            ->map(fn (string $name) => Tag::firstOrCreate(['name' => $name])->getKey());

        $this->tags()->sync($ids);
    }
}
