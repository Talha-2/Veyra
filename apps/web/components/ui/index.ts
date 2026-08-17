/* `@/components/ui` keeps resolving to Veyra's own primitives — PageHeader,
   SectionCard, EmptyState, Modal, Spinner, StatusBadge and friends — so the
   36 files importing it are untouched by the shadcn adoption.

   shadcn components live beside this as `@/components/ui/<name>`. As a legacy
   primitive gets a shadcn equivalent, its export moves here and the old
   implementation is deleted; nothing has to change at the call sites. */
export * from "./legacy";
