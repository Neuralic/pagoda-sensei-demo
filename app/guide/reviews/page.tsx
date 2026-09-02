"use client";

import { Card, CardContent } from "@/components/ui/card";

export default function ReviewsPage() {

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Reviews</h1>

        <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground mb-2">
            As a tour guide, you cannot leave reviews.
          </p>
          <p className="text-sm text-muted-foreground">
            Only travel agents can leave reviews for completed tours. Reviews left by agents will be displayed on your profile immediately.
          </p>
                </CardContent>
              </Card>
    </div>
  );
}

