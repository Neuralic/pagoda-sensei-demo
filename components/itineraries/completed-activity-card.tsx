"use client";

import { Card } from "@/components/ui/card";
import {  MapPin, Clock, Users, Calendar } from "lucide-react";
import Image from "next/image";
import ReactCountryFlag from "react-country-flag";
import { Badge } from "../ui/badge";

interface CompletedActivity {
  id: string;
  title: string;
  location: string;
  duration: string;
  date: string;
  completedDate: string;
  status: "Completed";
  image?: string;
  groupSize?: number | string;
  languages?: Array<string | { code: string; name: string }>;
  jobsCount?: number;
  unassignedCount?: number;
  hasActions?: boolean;
  itineraryId?: string;
}

interface CompletedActivityCardProps {
  activity: CompletedActivity;
}
const languageMap: Record<string, string> = {
  English: "US",
  Japanese: "JP",
  Portuguese: "PT",
  French: "FR",
  German: "DE",
  Spanish: "ES",
};
export function CompletedActivityCard({
  activity,
}: CompletedActivityCardProps) {
  return (
    <Card className="border border-border overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-4 p-4">
        {activity.image && (
          <div className="flex-shrink-0">
            <Image
              src={activity.image || "/placeholder.svg"}
              alt={activity.title}
              width={140}
              height={140}
              className="w-32 h-32 sm:w-36 sm:h-36 object-cover rounded-lg"
            />
          </div>
        )}

        {/* Middle section - Activity details */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {activity.title}
          </h3>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>{activity.location}</span>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>{activity.duration}</span>
              </div>

              {activity.groupSize && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {typeof activity.groupSize === "number"
                      ? `${activity.groupSize} People`
                      : activity.groupSize}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span>{activity.date}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(activity.languages ?? []).map((lang, index) => {
                const label = typeof lang === "string" ? lang : lang?.name ?? "";
                const code = typeof lang === "string" ? languageMap[lang] || "US" : lang?.code || (label ? languageMap[label] || "US" : "US");
                if (!label) return null;
                return (
                  <Badge
                    key={`${label}-${index}`}
                    variant="outline"
                    className="flex items-center gap-2 text-xs md:text-sm py-1 px-3 rounded-md"
                  >
                    <ReactCountryFlag
                      countryCode={code}
                      svg
                      style={{ width: "20px", height: "20px" }}
                      title={label}
                    />
                    {label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right section - Status and completion info */}
        <div className="flex flex-col items-end justify-between gap-4">
          <div className="text-right space-y-1">
            <p className="text-sm text-muted-foreground">
              {activity.completedDate}
            </p>
            <div className="flex items-center justify-end gap-2 mt-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-green-600">
                {activity.status}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
