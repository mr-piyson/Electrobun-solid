export default function App() {
  return (
    <main>
      <div class="min-h-screen bg-base-200 flex flex-col items-center justify-center gap-4">
        <h1 class="text-4xl font-bold text-primary">SolidJS + Tailwind + daisyUI</h1>

        <p class="text-gray-600">If the button below is styled and purple, your setup is complete!</p>

        {/* daisyUI Component Classes */}
        <div class="flex gap-2">
          <button class="btn btn-primary">Primary Button</button>
          <button class="btn btn-secondary">Secondary Button</button>
          <button class="btn btn-accent">Accent Button</button>
        </div>
      </div>
    </main>
  );
}
