import { Suspense } from "react";

import { ApplicationDetailsScreen } from "@/components/application-details-screen";
import { ApplicationDetailsSkeleton } from "@/components/loading-states";

export default function ApplicationDetailsPage() {
  return (
    <Suspense fallback={<ApplicationDetailsSkeleton />}>
      <ApplicationDetailsScreen />
    </Suspense>
  );
}
