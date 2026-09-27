<?php

namespace App\Services\Knowledge;

use App\Models\DocumentChunk;

/**
 * What the agent would retrieve for a query.
 *
 * Keyword search over chunks, ranked by term hits. One implementation serves
 * both the Studio "test retrieval" box and the agent's `knowledge/search`
 * route, so what an author sees on the page is exactly what the talker gets
 * on a call — the point of the test box is lost if they differ.
 *
 * The agent layer's hybrid retrieval (dense + BM25 + RRF) supersedes the
 * ranking; the shape of a hit stays.
 */
class KnowledgeSearch
{
    /**
     * @return array{query: string, results: list<array{document_id:int, document:?string, position:int, score:int, excerpt:string, content:string}>}
     */
    public function search(string $query, int $limit = 8): array
    {
        $terms = array_values(array_filter(preg_split('/\s+/', mb_strtolower(trim($query))) ?: [], fn ($t) => mb_strlen($t) > 2));
        if (! $terms) {
            return ['query' => $query, 'results' => []];
        }

        $results = DocumentChunk::query()
            ->with('document:id,name')
            ->whereHas('document', fn ($q) => $q->where('status', 'ready'))
            // lower() + like rather than ilike: Postgres in dev, SQLite in
            // tests, and this must mean the same thing on both.
            ->where(function ($q) use ($terms) {
                foreach ($terms as $t) {
                    $q->orWhereRaw('lower(content) like ?', ['%'.str_replace(['%', '_'], ['\%', '\_'], $t).'%']);
                }
            })
            ->limit(60)
            ->get()
            ->map(function (DocumentChunk $c) use ($terms) {
                $lower = mb_strtolower($c->content);
                $score = collect($terms)->sum(fn ($t) => mb_substr_count($lower, $t));

                return [
                    'document_id' => $c->document_id,
                    'document' => $c->document?->name,
                    'position' => $c->position,
                    'score' => $score,
                    'excerpt' => $this->snippet($c->content, $lower, $terms),
                    'content' => $c->content,
                ];
            })
            ->sortByDesc('score')
            ->take($limit)
            ->values()
            ->all();

        return ['query' => $query, 'results' => $results];
    }

    /**
     * A window of the chunk around the first term hit.
     *
     * The chunk's opening lines are often the overlap carried from the
     * previous chunk, so "first 280 characters" showed the wrong paragraph
     * for exactly the matches that mattered.
     */
    private function snippet(string $content, string $lower, array $terms, int $width = 280): string
    {
        $hit = collect($terms)->map(fn ($t) => mb_strpos($lower, $t))->filter(fn ($p) => $p !== false)->min();
        if ($hit === null) {
            return str($content)->limit($width)->value();
        }

        $start = max(0, $hit - intdiv($width, 3));
        $slice = mb_substr($content, $start, $width);

        return ($start > 0 ? '…' : '').trim($slice).(mb_strlen($content) > $start + $width ? '…' : '');
    }
}
