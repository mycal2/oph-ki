import Image from "next/image";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary p-4">
      <div className="mb-8">
        <Image
          src="/ids-logo.svg"
          alt="IDS.online"
          width={160}
          height={50}
          priority
          className="h-10 w-auto"
        />
      </div>
      {children}
      <p className="mt-8 text-xs text-muted-foreground">
        IDS.online GmbH &mdash; 100% Tochter des VDDI
      </p>
    </div>
  );
}
