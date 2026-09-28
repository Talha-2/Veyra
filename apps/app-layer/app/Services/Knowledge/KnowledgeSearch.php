<?php

namespace App\Services\Knowledge;

use App\Models\DocumentChunk;

/**
 * What the agent would retrieve for a query.
 *
 * Keyword search over chunks: stems and everyday synonyms, matched in the
 * text and the document title, ranked by how much of the question a chunk
 * covers. One implementation serves
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
    /**
     * Words that carry no meaning for retrieval. "How much is a visit" is
     * about "visit" and a price, not about "how" or "much".
     */
    private const STOPWORDS = ['the', 'and', 'you', 'your', 'our', 'are', 'for', 'with', 'what', 'does', 'how', 'much', 'can', 'will', 'there', 'this', 'that', 'have', 'from', 'about', 'any', 'into', 'out', 'come', 'get', 'need', 'want', 'please', 'hi', 'hello', 'thanks', 'is', 'do', 'to', 'in', 'on', 'of', 'a', 'an', 'my', 'me', 'we', 'us', 'it', 'be'];

    /**
     * Everyday synonyms callers use for the same fact. A caller asks "what
     * does a visit cost"; the document says "a diagnostic visit is $89".
     * Stems, matched as substrings, so "pric" covers price and pricing.
     */
    private const CONCEPTS = [
        ['pric', 'cost', 'fee', 'charg', 'rate', 'quot', '$'],
        ['area', 'serv', 'cover', 'county', 'zone', 'location'],
        ['book', 'schedul', 'appointment', 'slot', 'availab'],
        ['hour', 'open', 'clos'],
        ['cancel', 'refund', 'reschedul', 'resched'],
        ['pay', 'card', 'cash', 'deposit', 'ach'],
        ['warrant', 'guarant'],
        ['emergenc', 'urgent', 'same-day', 'same day'],
    ];

    /**
     * @return array{query: string, results: list<array{document_id:int, document:?string, position:int, score:int, excerpt:string, content:string}>}
     */
    public function search(string $query, int $limit = 8, bool $withMemory = true): array
    {
        $concepts = $this->concepts($query);
        if (! $concepts) {
            return ['query' => $query, 'results' => []];
        }
        $variants = array_values(array_unique(array_merge(...$concepts)));

        $results = DocumentChunk::query()
            ->with('document:id,name')
            // `withMemory: false` is the public API's view: the knowledge
            // base only, not what the agent has noted for itself.
            ->whereHas('document', fn ($q) => $q->where('status', 'ready')->when(! $withMemory, fn ($d) => $d->where('source_type', '!=', 'agent')))
            // lower() + like rather than ilike: Postgres in dev, SQLite in
            // tests, and this must mean the same thing on both. A chunk
            // qualifies on its text or on its document's title.
            ->where(function ($q) use ($variants) {
                foreach ($variants as $v) {
                    $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $v).'%';
                    $q->orWhereRaw('lower(content) like ?', [$like])
                        ->orWhereHas('document', fn ($d) => $d->whereRaw('lower(name) like ?', [$like]));
                }
            })
            ->limit(80)
            ->get()
            ->map(function (DocumentChunk $c) use ($concepts, $variants) {
                $lower = mb_strtolower($c->content);
                $title = mb_strtolower((string) $c->document?->name);
                $score = 0;
                foreach ($concepts as $group) {
                    $inText = collect($group)->sum(fn ($v) => mb_substr_count($lower, $v));
                    $inTitle = collect($group)->contains(fn ($v) => str_contains($title, $v));
                    // Covering more of the question beats repeating one word.
                    if ($inText || $inTitle) {
                        $score += 4 + min($inText, 3) + ($inTitle ? 3 : 0);
                    }
                }

                return [
                    'document_id' => $c->document_id,
                    'document' => $c->document?->name,
                    'position' => $c->position,
                    'score' => $score,
                    'excerpt' => $this->snippet($c->content, $lower, $variants),
                    'content' => $c->content,
                ];
            })
            ->filter(fn ($r) => $r['score'] > 0)
            ->sortByDesc('score')
            ->take($limit)
            ->values()
            ->all();

        return ['query' => $query, 'results' => $results];
    }

    /**
     * The query as a list of concepts, each a list of substrings that count
     * as a mention: the word's stem plus its everyday synonyms.
     *
     * @return list<list<string>>
     */
    private function concepts(string $query): array
    {
        $words = preg_split('/[^\p{L}\p{N}$-]+/u', mb_strtolower($query)) ?: [];
        $out = [];
        foreach ($words as $w) {
            if ($w === '' || in_array($w, self::STOPWORDS, true) || (mb_strlen($w) < 3 && $w !== '$')) {
                continue;
            }
            $stem = $this->stem($w);
            $group = [$stem];
            foreach (self::CONCEPTS as $concept) {
                if (collect($concept)->contains(fn ($c) => str_starts_with($stem, $c) || str_starts_with($c, $stem))) {
                    $group = array_merge($group, $concept);
                }
            }
            $out[implode('|', $group)] = array_values(array_unique($group));
        }

        return array_values($out);
    }

    /** A light suffix stripper: pricing, priced, prices → pric. Good enough to match word forms. */
    private function stem(string $word): string
    {
        if (mb_strlen($word) <= 4) {
            return $word;
        }
        foreach (['ings', 'ing', 'ies', 'ied', 'es', 'ed', 's'] as $suffix) {
            if (str_ends_with($word, $suffix) && mb_strlen($word) - mb_strlen($suffix) >= 3) {
                $word = mb_substr($word, 0, -mb_strlen($suffix));
                break;
            }
        }

        return mb_strlen($word) > 4 ? rtrim($word, 'e') : $word;
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
