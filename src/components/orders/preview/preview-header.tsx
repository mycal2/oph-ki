import Image from "next/image";

/**
 * OPH-16: Branding-neutral header for the public preview page.
 * Shows only the IDS logo without navigation or user menu.
 */
export function PreviewHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6 lg:px-8">
        <Image
          src="/ids-logo.svg"
          alt="IDS.online"
          width={120}
          height={36}
          priority
          className="h-8 w-auto"
        />
      </div>
    </header>
  );
}
