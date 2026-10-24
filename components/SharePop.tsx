import { linkedinUrl, tweetUrl, whatsappUrl } from '../lib/share';

type Props = { text: string; url: string; onCopy: () => void };

// Where the native share sheet is missing: copy the link, or open a network with the text filled in.
export default function SharePop({ text, url, onCopy }: Props) {
  return (
    <div className="drop sharepop" role="dialog" aria-label="Share this comparison">
      <button type="button" onClick={onCopy}>
        Copy link
      </button>
      <a href={tweetUrl(text, url)} target="_blank" rel="noopener noreferrer">
        X
      </a>
      <a href={whatsappUrl(text, url)} target="_blank" rel="noopener noreferrer">
        WhatsApp
      </a>
      <a href={linkedinUrl(url)} target="_blank" rel="noopener noreferrer">
        LinkedIn
      </a>
    </div>
  );
}
