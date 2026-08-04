import SignUpForm from "@/components/SignUpForm";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <p className="font-heading text-sm tracking-[0.24em] uppercase text-muted-foreground">
            Cache
          </p>
          <h1 className="font-heading text-3xl font-bold">Your learning cache</h1>
          <p className="text-sm text-muted-foreground">
            Capture now. Learn later.
          </p>
        </div>

        <SignUpForm />
      </section>
    </main>
  );
}
