import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactCountryFlag from "react-country-flag";
import { LANGUAGE_FLAG_MAP } from "@/lib/countries-map";

type AboutProps = {
  bio?: string;
  languages?: string[];
};

export function AboutSection({ bio, languages }: AboutProps) {
  const getCountryCode = (name: string): string | undefined => {
    const key = name.trim().toLowerCase();
    return LANGUAGE_FLAG_MAP[key];
  };

  return (
    <Card className="border shadow-md px-5 rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg md:text-xl">About me</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <hr className="my-4" />
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
          {bio && bio.trim().length > 0
            ? bio
            : ""}
        </p>

        {/* Language Selection */}
        <div className="space-y-2">
          <p className="text-xs md:text-sm font-semibold text-foreground">
            Language Spoken
          </p>
          <hr className="my-4" />

          <div className="flex flex-wrap gap-3 items-center">
            {Array.isArray(languages) && languages.length > 0
              ? languages.map((name) => {
                  const code = getCountryCode(name);
                  return (
                    <Badge
                      key={name}
                      variant="secondary"
                      className="text-lg flex items-center gap-2 py-2 px-3 rounded-lg"
                    >
                      {code && (
                        <ReactCountryFlag
                          countryCode={code}
                          svg
                          style={{ width: "24px", height: "24px" }}
                          title={name}
                        />
                      )}
                      {name}
                    </Badge>
                  );
                })
              : ""}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
