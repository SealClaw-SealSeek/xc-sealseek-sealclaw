import { t, type Lang } from "../i18n";

export function Footer({ lang }: { lang: Lang }) {
  return (
    <footer
      style={{
        marginTop: "auto",
        padding: "var(--space-4) var(--space-4)",
        borderTop: "1px solid var(--border)",
        textAlign: "center",
        fontSize: "0.875rem",
        color: "var(--text-muted)",
      }}
    >
      <div>{t(lang, "footer")}</div>
    </footer>
  );
}
