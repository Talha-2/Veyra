import { router, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';

/**
 * A create dialog that the URL can open.
 *
 * The command palette links to `/studio/skills?new=1`; this opens the dialog
 * when that param is present and, on close, drops it from the address bar
 * (a client-side replace, no request) so a refresh does not reopen it.
 */
export function useCreateParam(): [boolean, (open: boolean) => void] {
    const { url } = usePage();
    const wantsNew = /[?&]new=1(&|$)/.test(url);
    const [open, setOpenState] = useState(wantsNew);

    useEffect(() => {
        if (wantsNew) setOpenState(true);
    }, [wantsNew]);

    const setOpen = useCallback(
        (next: boolean) => {
            setOpenState(next);
            if (!next && wantsNew) {
                const clean = url.replace(/([?&])new=1(&|$)/, (_, lead: string, tail: string) => (tail ? lead : '')).replace(/[?&]$/, '');
                router.replace({ url: clean, preserveState: true, preserveScroll: true });
            }
        },
        [url, wantsNew],
    );

    return [open, setOpen];
}
