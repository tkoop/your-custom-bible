<?php
// The reading-plan arithmetic, ported from public/plans.js.
//
// This exists so the server can say what a subscription reads today, and it has
// to say it exactly the way plans.js would - otherwise a push notification
// contradicts the card on the reader's home page. It is a port rather than a
// shared module because PHP cannot run JavaScript.
//
// It is pinned by a fixture instead of by trust. tools/buildPlanFixture.mjs runs
// the real plans.js and writes down every answer in
// resources/planFixture.json; ScheduleTest.php asserts this file reproduces all
// of them. When plans.js changes, regenerate the fixture and the diff shows
// whether the answers moved. The functions below are line-for-line in the order
// plans.js declares them, so a change there is easy to carry across.

class Schedule
{
    /** @var array the book list, in Bible order */
    private $books = [];

    /** @var array slug => book */
    private $booksBySlug = [];

    /** @var array the chronological chapter list, flattened and deduplicated */
    private $chronoChapters = null;

    /** @var array plan id|order => chapter list, built once each */
    private $chapterLists = [];

    /**
     * @param array $books the book list from resources/books.json
     * @param array $chronoEntries the raw chronological file
     */
    public function __construct($books, $chronoEntries)
    {
        foreach ($books as $book) {
            $this->books[] = $book;
            $this->booksBySlug[$book['slug']] = $book;
        }
        $this->chronoChapters = $this->planChronoBuild($chronoEntries);
    }

    /**
     * Builds a Schedule from the files the app itself reads.
     *
     * public/chronoChapters.json, not resources/ChronoChapters.json: the two
     * are not the same file. The one in resources still carries the repeated
     * superscript groups and lists 1204 chapters; the one the browser fetches
     * lists each of the 1189 once. The server has to read the same bytes the
     * browser does or a chronological plan would come out a different list.
     */
    public static function load($root = null)
    {
        $root = $root ?: dirname(__DIR__);
        $books = json_decode(file_get_contents($root . '/resources/books.json'), true);
        $chrono = json_decode(file_get_contents($root . '/public/chronoChapters.json'), true);
        if (!is_array($books) || !is_array($chrono)) {
            throw new RuntimeException('could not read books.json or chronoChapters.json');
        }
        return new Schedule($books, $chrono);
    }

    // ---------- The chapters of a plan ----------

    /**
     * The chronological order the app's index uses, flattened to one chapter
     * per entry and deduplicated - the file groups by date and superscription,
     * so Genesis appears more than once and Psalm 51 stands on its own between
     * 1 and 2 Samuel. That interleaving is the point of reading
     * chronologically, so the first mention of a chapter is the one kept.
     */
    private function planChronoBuild($entries)
    {
        $chapters = [];
        $seen = [];
        foreach ($entries as $entry) {
            // The file spells the Psalms "Psalm" in the superscription groups.
            $name = $entry['book'] === 'Psalm' ? 'Psalms' : $entry['book'];
            $book = $this->bookByName($name);
            if (!$book) {
                continue;
            }
            foreach ($entry['chapter'] as $number) {
                $key = $book['slug'] . ':' . $number;
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $chapters[] = [
                    'name' => $book['name'],
                    'slug' => $book['slug'],
                    'chapter' => $number,
                ];
            }
        }
        return $chapters;
    }

    private function bookByName($name)
    {
        foreach ($this->books as $book) {
            if ($book['name'] === $name) {
                return $book;
            }
        }
        return null;
    }

    public function bookSlugs($plan)
    {
        if (!isset($plan['books']) || $plan['books'] === 'all') {
            return array_column($this->books, 'slug');
        }
        return $plan['books'];
    }

    /**
     * The order is the subscription's, not the plan's: the same plan read
     * canonically by one reader and chronologically by another stays right for
     * both.
     */
    public function planOrder($plan, $order = null)
    {
        if (!empty($order)) {
            return $order;
        }
        if (!empty($plan['order'])) {
            return $plan['order'];
        }
        return 'canonical';
    }

    /**
     * The reading list itself: every chapter of every book in the plan, in
     * order. Built once per plan and order, because the whole Bible is 1189
     * chapters and a cron tick may walk several reminders.
     */
    public function planChapterList($plan, $order = null)
    {
        $order = $this->planOrder($plan, $order);
        // Keyed on the plan's contents rather than its id. plans.js can use the
        // id, because there a plan is only ever looked up by planById and ids
        // are unique across BUILT_IN_PLANS and the reader's own. Here the plans
        // arrive from a client, and two readers' own plans could carry the same
        // id - a cache hit would then hand one reader's chapters to another.
        $key = md5(json_encode($plan) . '|' . $order);

        if (isset($this->chapterLists[$key])) {
            return $this->chapterLists[$key];
        }

        $wanted = array_flip($this->bookSlugs($plan));

        if ($order === 'chronological') {
            // The index's order, cut down to this plan's books. Filtering leaves
            // the interleaving alone, so a plan over the whole Bible reads the
            // Songs where the index puts them.
            $chapters = [];
            foreach ($this->chronoChapters as $chapter) {
                if (isset($wanted[$chapter['slug']])) {
                    $chapters[] = $chapter;
                }
            }
        } else {
            // Canonical: every chapter of every book, in the order the books
            // stand in books.js - which is the order they were given in here.
            $chapters = [];
            foreach ($this->bookSlugs($plan) as $slug) {
                if (!isset($this->booksBySlug[$slug])) {
                    continue;
                }
                $book = $this->booksBySlug[$slug];
                for ($number = 1; $number <= $book['chapters']; $number++) {
                    $chapters[] = [
                        'name' => $book['name'],
                        'slug' => $book['slug'],
                        'chapter' => $number,
                    ];
                }
            }
        }

        $this->chapterLists[$key] = $chapters;
        return $chapters;
    }

    public function planTotalChapters($plan, $order = null)
    {
        return count($this->planChapterList($plan, $order));
    }

    /**
     * A plan lasts either as long as its duration says, or for as many days as
     * it takes to get through the chapters at its pace.
     */
    public function planTotalDays($plan, $totalChapters)
    {
        if (isset($plan['pace']) && $plan['pace'] === 'perDay') {
            $count = max(1, (int) floor($plan['perDay'] ?? 1));
            $count = $count > 0 ? $count : 1;
            return max(1, (int) ceil($totalChapters / $count));
        }
        $days = isset($plan['days']) ? (int) floor($plan['days']) : 0;
        return max(1, $days ?: 1);
    }

    /**
     * Where one day's reading starts and ends in the list, counted from day 0.
     *
     * The boundaries come from the whole list rather than a rounded-up
     * chapters-a-day figure, so 1189 chapters over 365 days gives a day of
     * three and a day of four in proportion rather than four every day and a
     * fortnight off the end. The day is clamped, so the last day of a plan is
     * the same range however far past it the reader is.
     */
    public function planDayRange($plan, $order, $day)
    {
        $total = $this->planTotalChapters($plan, $order);
        $days = $this->planTotalDays($plan, $total);
        if ($total === 0 || $days < 1) {
            return ['start' => 0, 'end' => 0];
        }
        $clamped = min(max((int) $day, 0), $days - 1);
        return [
            'start' => (int) floor(($clamped * $total) / $days),
            'end' => (int) floor((($clamped + 1) * $total) / $days),
        ];
    }

    public function planDayChapters($plan, $order, $day)
    {
        $range = $this->planDayRange($plan, $order, $day);
        $list = $this->planChapterList($plan, $order);
        return array_slice($list, $range['start'], $range['end'] - $range['start']);
    }

    /**
     * "Genesis 1-3, 5", for a day that stays inside one book, so a reader can see
     * the shape of the day before opening it.
     */
    public function planReadingsLabel($chapters)
    {
        $parts = [];
        $run = null;
        $close = function () use (&$run, &$parts) {
            if ($run === null) {
                return;
            }
            $name = self::chapterRefName($run['name']);
            $parts[] = $run['start'] === $run['end']
                ? "$name " . $run['start']
                : "$name " . $run['start'] . '-' . $run['end'];
            $run = null;
        };

        foreach ($chapters as $chapter) {
            if ($run !== null && $run['name'] === $chapter['name'] && $chapter['chapter'] === $run['end'] + 1) {
                $run['end'] = $chapter['chapter'];
                continue;
            }
            $close();
            $run = [
                'name' => $chapter['name'],
                'start' => $chapter['chapter'],
                'end' => $chapter['chapter'],
            ];
        }
        $close();

        return implode(', ', $parts);
    }

    /** The file and the app both say "Psalm" for the one book. */
    public static function chapterRefName($bookName)
    {
        return $bookName === 'Psalms' ? 'Psalm' : $bookName;
    }

    // ---------- Where a subscription has got to ----------

    /**
     * Whole days from a subscription's start date to today.
     *
     * Both are the reader's own local dates, not instants, and the difference is
     * taken as dates rather than as a number of milliseconds: a plan is a
     * calendar the reader is on, so it steps over a daylight-saving change
     * rather than drifting by an hour.
     */
    public function planDaysSince($start, $today)
    {
        $then = self::dateFromString($start);
        if ($then === null) {
            return 0;
        }
        $now = self::dateFromString($today);
        if ($now === null) {
            return 0;
        }
        return (int) round(($now->getTimestamp() - $then->getTimestamp()) / 86400);
    }

    public static function dateFromString($value)
    {
        $parts = explode('-', (string) $value);
        if (count($parts) !== 3) {
            return null;
        }
        $date = DateTimeImmutable::createFromFormat(
            'Y-m-d',
            sprintf('%04d-%02d-%02d', (int) $parts[0], (int) $parts[1], (int) $parts[2]),
            new DateTimeZone('UTC'),
        );
        return $date === false ? null : $date;
    }

    /**
     * Everything a notification needs about a subscription. $today is the
     * reader's local date, worked out from the stored timezone - the server's
     * own date is not theirs, and using it would send the nudge at the wrong
     * point in their day.
     */
    public function subscriptionState($plan, $order, $start, $today)
    {
        $hasPlan = $plan !== null;
        $totalChapters = $hasPlan ? $this->planTotalChapters($plan, $order) : 0;
        $totalDays = $hasPlan ? $this->planTotalDays($plan, $totalChapters) : 0;
        $elapsed = $this->planDaysSince($start, $today);
        // A start date in the future is a plan lined up, not one to catch up on.
        $startsIn = $elapsed < 0 ? -$elapsed : 0;
        // Today lands on the last day of the plan once it is over, so the final
        // day is still known.
        $day = min(max($elapsed + 1, 1), max($totalDays, 1));

        return [
            'totalDays' => $totalDays,
            'totalChapters' => $totalChapters,
            'day' => $day,
            'startsIn' => $startsIn,
            'complete' => $hasPlan && $elapsed >= $totalDays,
            'chapters' => ($startsIn > 0 || !$hasPlan)
                ? []
                : $this->planDayChapters($plan, $order, $day - 1),
        ];
    }

    /**
     * The notification itself: the plan's name and what to read, so the reader
     * can see at a glance whether it is worth opening the app. This is the text
     * plans.js's notifyBody() writes, and the fixture holds both.
     */
    public function notification($plan, $order, $start, $today)
    {
        $state = $this->subscriptionState($plan, $order, $start, $today);
        $name = ($plan !== null && !empty($plan['name'])) ? $plan['name'] : 'Plan';

        if ($state['complete']) {
            $body = $name . ' - finished. Ready to go round again?';
        } elseif (!$state['chapters']) {
            $body = $name . ' - nothing scheduled today. A rest day.';
        } else {
            $body = $name . ' - today: ' . $this->planReadingsLabel($state['chapters']);
        }

        return [
            'title' => 'Reading plan reminder',
            'body' => $body,
            'day' => $state['day'],
            'totalDays' => $state['totalDays'],
            'startsIn' => $state['startsIn'],
            'complete' => $state['complete'],
        ];
    }
}