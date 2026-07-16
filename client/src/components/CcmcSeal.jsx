// Official CCMC seal — the user's own reference image (fetched from their
// Google Drive after pasted/attached copies in chat couldn't be read as a
// file in this environment), saved to public/ccmc-seal.png and used as-is
// (not redrawn) per their explicit request. Rendered as a shared <img>
// component so the same file is used everywhere it appears: the login
// screen, the navbar, and the PDF letterhead (see LoginPage.jsx, Navbar.jsx,
// PrintLetterhead.jsx) — updating this one file updates all three.
export default function CcmcSeal({ width = 56, height = 56 }) {
  return (
    <img
      src="/ccmc-seal.png"
      alt="Coimbatore City Municipal Corporation seal"
      width={width}
      height={height}
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}
