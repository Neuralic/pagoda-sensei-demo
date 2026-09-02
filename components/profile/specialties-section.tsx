"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import { FileText, Download } from "lucide-react";

type SpecialtiesProps = {
  specialties?: string[];
  documents?: string[];
};

export function SpecialtiesSection({ specialties, documents }: SpecialtiesProps) {

  const docPaths = useMemo(() => (Array.isArray(documents) ? documents : []), [documents]);
  const [signedDocs, setSignedDocs] = useState<Array<{ name: string; url: string; path: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function signDocs() {
      try {
        if (!docPaths.length) {
          setSignedDocs([]);
          return;
        }
        const res = await getSignedUrls(docPaths.map((p) => ({ bucket: BUCKETS.documents, path: p })));
        if (!cancelled) {
          setSignedDocs(
            res
              .map((s) => ({
                path: s.path,
                name: s.path.split("/").pop() || s.path,
                url: s.signedUrl || s.publicUrl || "",
              }))
              .filter((d) => d.url)
          );
        }
      } catch {
        if (!cancelled) setSignedDocs([]);
      }
    }
    signDocs();
    return () => {
      cancelled = true;
    };
  }, [docPaths]);

  return (
    <Card className="border shadow-md rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg md:text-xl">Tour Specialties</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Specialties Tags */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(specialties && specialties.length ? specialties : []).map((specialty) => (
              <Badge
                key={specialty}
                variant="secondary"
                className="bg-[#F9F5E8] hover:bg-[#F9F5E8] text-xs md:text-sm justify-center py-1 px-8 rounded-lg"
              >
                {specialty}
              </Badge>
            ))}
          </div>
        </div>

        {/* Certifications / Licenses (from uploaded documents) */}
        <div className="space-y-3 pt-4 border-t">
          <p className="text-xs md:text-sm font-semibold text-foreground">Certifications / Licenses</p>
          <div className="space-y-2">
            {signedDocs.length === 0 ? (
              <p className="text-xs md:text-sm text-muted-foreground">No certifications or licenses uploaded yet</p>
            ) : (
              <div className="pt-2">
                <ul className="divide-y divide-border rounded-md bg-background">
                  {signedDocs.map((d) => (
                    <li key={d.path} className="flex items-center justify-between py-2 px-3 gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-foreground/80 flex-shrink-0" />
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-xs md:text-sm hover:underline"
                          title={d.name}
                        >
                          {d.name}
                        </a>
                      </div>
                      <a
                        href={d.url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-[#D4AA25] text-xs md:text-sm hover:underline"
                      >
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
