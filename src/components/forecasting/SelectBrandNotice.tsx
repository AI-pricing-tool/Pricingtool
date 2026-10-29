export function SelectBrandNotice({ page }: { page: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">Select a single reseller</p>
      <p className="text-xs text-muted-foreground mt-1">
        {page} works per brand. Choose a specific reseller from the dropdown above to continue.
      </p>
    </div>
  );
}
