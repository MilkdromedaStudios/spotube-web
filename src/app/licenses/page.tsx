import Link from "next/link";
import { Page } from "@/components/Page";

export const metadata = { title: "License and notices" };

export default function LicensesPage() {
  return (
    <Page title="License and notices">
      <div className="flex flex-col gap-4 text-sm text-muted">
        <p>
          Spotube Web is derived from{" "}
          <a className="underline" href="https://github.com/KRTirtho/spotube" target="_blank" rel="noreferrer">
            Spotube
          </a>{" "}
          by Kingkor Roy Tirtho and contributors. This product includes software developed by Kingkor Roy Tirtho.
        </p>
        <p>
          The full license text is below and in{" "}
          <a className="underline" href="/LICENSE.txt">
            LICENSE.txt
          </a>
          . Third-party npm packages keep their own licenses (see each package in <code>node_modules</code>).
        </p>
        <iframe title="BSD-4-Clause license" src="/LICENSE.txt" className="h-[28rem] w-full rounded-xl border border-line bg-white" />
        <p>
          YouTube, Spotify and SoundCloud are trademarks of their respective owners. Spotube Web uses their official
          APIs and players and is not affiliated with them.
        </p>
        <Link href="/settings#about" className="underline">
          Back to settings
        </Link>
      </div>
    </Page>
  );
}
