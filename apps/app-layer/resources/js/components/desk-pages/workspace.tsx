import type { ReactNode } from 'react';
export function WorkspacePage({ header, children, className = '' }: { header: ReactNode; children: ReactNode; className?: string }) {
    return <div className={'desk-workspace ' + className}><div className="desk-workspace-header">{header}</div><div className="desk-workspace-body">{children}</div></div>;
}
