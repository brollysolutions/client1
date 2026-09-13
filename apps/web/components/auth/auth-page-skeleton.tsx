import { Logo } from "@/components/logo";
import { FormSkeleton } from "@/components/form-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthLegalLinks } from "./auth-legal-links";

// Match AuthShell while a route/search-parameter boundary is pending. The
// original logo and legal navigation stay usable; placeholders are decorative.
export function AuthPageSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="min-h-dvh w-full bg-surface lg:grid lg:h-dvh lg:grid-cols-[minmax(0,3fr)_minmax(400px,2fr)]">
      <div aria-hidden="true" className="hidden flex-col justify-center gap-6 bg-brand-navy p-8 lg:flex xl:p-12">
        <Skeleton className="mx-auto aspect-square w-full max-w-sm rounded-3xl bg-white/15" />
        <Skeleton className="h-10 w-4/5 bg-white/20" />
        <Skeleton className="h-5 w-full bg-white/15" />
      </div>
      <div className="min-w-0 px-4 sm:px-10 lg:h-dvh lg:overflow-y-auto lg:px-12 xl:px-16">
        <div className="flex min-h-dvh flex-col justify-center py-8 sm:py-10 lg:min-h-full">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-6">
              <Logo className="w-48 sm:w-52" sizes="(min-width: 640px) 208px, 192px" />
            </div>
            <Skeleton className="mb-6 h-11 w-28" />
            <FormSkeleton fields={fields} />
            <AuthLegalLinks />
          </div>
        </div>
      </div>
    </div>
  );
}
