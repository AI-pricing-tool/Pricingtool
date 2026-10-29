import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Upload, FileText, CheckCircle2, Loader2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { extractStatement } from "@/lib/statements.functions";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

const ACQUIRERS = ["Worldpay","Barclaycard","First Data","Global Payments","Dojo","Elavon","Adyen","Stripe","EVO","AIB"];

function UploadPage() {
  const { profile, user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const extractFn = useServerFn(extractStatement);
  const [file, setFile] = useState<File | null>(null);
  const [acquirer, setAcquirer] = useState<string>("");
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [merchantQuery, setMerchantQuery] = useState("");
  const [merchantOpen, setMerchantOpen] = useState(false);
  const [progress, setProgress] = useState<"idle" | "uploading" | "parsing" | "done">("idle");

  const { data: merchants = [] } = useQuery({
    queryKey: ["merchants", "picker", profile?.organisation_id],
    enabled: !!profile?.organisation_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchants")
        .select("id, name, acquirer")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; acquirer: string | null }[];
    },
  });

  const trimmedQuery = merchantQuery.trim();
  const queryLower = trimmedQuery.toLowerCase();
  const exactMatch = useMemo(
    () => merchants.find((m) => m.name.toLowerCase() === queryLower),
    [merchants, queryLower],
  );
  const selectedMerchant = useMemo(
    () => merchants.find((m) => m.id === merchantId) ?? null,
    [merchants, merchantId],
  );

  function pickExisting(m: { id: string; name: string; acquirer: string | null }) {
    setMerchantId(m.id);
    setMerchantName(m.name);
    setMerchantQuery("");
    if (m.acquirer && !acquirer) setAcquirer(m.acquirer);
    setMerchantOpen(false);
  }

  function pickNew(name: string) {
    setMerchantId(null);
    setMerchantName(name);
    setMerchantQuery("");
    setMerchantOpen(false);
  }


  const onDrop = useCallback((files: File[]) => {
    if (files[0]) setFile(files[0]);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      "application/pdf": [".pdf"],
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "image/*": [".png", ".jpg", ".jpeg"],
    },
  });

  async function ensureOrganisation(): Promise<string> {
    if (profile?.organisation_id) return profile.organisation_id;
    if (!user) throw new Error("Not signed in");
    const base = (profile?.full_name || user.email || "workspace").split("@")[0];
    // The name typed on the sign-up form, kept in the user's metadata until the first upload.
    const typed = String(user.user_metadata?.organisation_name ?? "").trim();
    const { data, error } = await supabase.rpc("create_organisation_for_current_user", {
      p_name: typed || `${base}'s workspace`,
    });
    if (error) throw error;
    await refreshProfile();
    return data as string;
  }

  async function handleUpload() {
    if (!file) {
      toast.error("Please select a file");
      return;
    }
    setProgress("uploading");
    try {
      const organisationId = await ensureOrganisation();
      // 1. Reuse selected merchant, or create new one if a name was typed
      let mid: string | null = merchantId;
      if (!mid && merchantName.trim()) {
        const { data: merch, error: mErr } = await supabase.from("merchants").insert({
          name: merchantName.trim(),
          organisation_id: organisationId,
          acquirer: acquirer || null,
        }).select("id").single();
        if (mErr) throw mErr;
        mid = merch.id;
      }


      // 2. Upload file
      const path = `${organisationId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("statements").upload(path, file);
      if (upErr) throw upErr;

      // 3. Create statement record
      const { data: stmt, error: sErr } = await supabase.from("statements").insert({
        organisation_id: organisationId,
        merchant_id: mid,
        acquirer: acquirer || null,
        file_path: path,
        file_name: file.name,
        file_type: file.type,
        status: "processing",
        uploaded_by: user?.id ?? null,
      }).select("id").single();
      if (sErr) throw sErr;

      setProgress("parsing");
      try {
        const res = await extractFn({ data: { statementId: stmt.id } });
        toast.success(`Extracted ${res.lineCount} fee line${res.lineCount === 1 ? "" : "s"}`);
        if ((res.siteCount ?? 0) > 1) {
          toast.info(`${res.siteCount} merchant IDs (MIDs) were found in this PDF. Lines are tagged by MID and not merged into the selected merchant.`);
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Automatic extraction failed. Opening the analysis so you can retry.");
      }

      setProgress("done");
      qc.invalidateQueries({ queryKey: ["merchants"] });
      navigate({ to: "/analyses/$id", params: { id: stmt.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
      setProgress("idle");
    }
  }

  return (
    <>
      <PageHeader title="Upload statement" description="PDF, CSV, XLSX, or image. We'll extract every fee line and map it to canonical categories." />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "rounded-2xl border-2 border-dashed bg-card p-12 text-center transition-colors cursor-pointer animate-fade-in",
              isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            )}
          >
            <input {...getInputProps()} />
            <div className="size-14 rounded-2xl bg-gradient-brand mx-auto grid place-items-center shadow-elevated">
              <Upload className="size-6 text-primary-foreground" />
            </div>
            <div className="mt-4 font-medium">{file ? file.name : "Drop your statement here"}</div>
            <div className="text-sm text-muted-foreground mt-1">{file ? `${(file.size / 1024).toFixed(1)} KB` : "or click to browse — PDF · CSV · XLSX · PNG/JPG"}</div>
          </div>

          {file && (
            <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
              <FileText className="size-5 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Remove</Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft space-y-4">
          <div>
            <div className="font-semibold">Details</div>
            <div className="text-xs text-muted-foreground">Help us classify your statement faster.</div>
          </div>
          <div className="space-y-1.5">
            <Label>Merchant</Label>
            <Popover open={merchantOpen} onOpenChange={setMerchantOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className={cn("truncate", !merchantName && "text-muted-foreground")}>
                    {merchantName
                      ? selectedMerchant
                        ? merchantName
                        : `New: ${merchantName}`
                      : "Select or create merchant"}
                  </span>
                  <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                  filter={(value, search) =>
                    value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }
                >
                  <CommandInput
                    placeholder="Search merchants…"
                    value={merchantQuery}
                    onValueChange={setMerchantQuery}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {trimmedQuery ? (
                        <button
                          type="button"
                          onClick={() => pickNew(trimmedQuery)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent rounded"
                        >
                          <Plus className="size-4" /> Create "{trimmedQuery}"
                        </button>
                      ) : (
                        "No merchants yet."
                      )}
                    </CommandEmpty>
                    {merchants.length > 0 && (
                      <CommandGroup heading="Existing">
                        {merchants.map((m) => (
                          <CommandItem
                            key={m.id}
                            value={m.name}
                            onSelect={() => pickExisting(m)}
                          >
                            <Check
                              className={cn(
                                "mr-2 size-4",
                                merchantId === m.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="truncate">{m.name}</span>
                            {m.acquirer && (
                              <span className="ml-auto text-xs text-muted-foreground">{m.acquirer}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {trimmedQuery && !exactMatch && (
                      <CommandGroup heading="New">
                        <CommandItem
                          value={`__create__${trimmedQuery}`}
                          onSelect={() => pickNew(trimmedQuery)}
                        >
                          <Plus className="mr-2 size-4" />
                          Create "{trimmedQuery}"
                        </CommandItem>
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Acquirer</Label>
            <Select value={acquirer} onValueChange={setAcquirer}>
              <SelectTrigger><SelectValue placeholder="Select acquirer" /></SelectTrigger>
              <SelectContent>{ACQUIRERS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={handleUpload} disabled={!file || progress !== "idle"} className="w-full bg-gradient-brand text-primary-foreground">
            {progress === "idle" && "Upload & analyse"}
            {progress === "uploading" && (<><Loader2 className="size-4 mr-2 animate-spin" /> Uploading…</>)}
            {progress === "parsing" && (<><Loader2 className="size-4 mr-2 animate-spin" /> Extracting fees…</>)}
            {progress === "done" && (<><CheckCircle2 className="size-4 mr-2" /> Done</>)}
          </Button>
        </div>
      </div>
    </>
  );
}
