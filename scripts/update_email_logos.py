from __future__ import annotations

from pathlib import Path
from textwrap import dedent
import re

EMAIL_PATH = Path(r"c:/Users/HP/Downloads/ChainSync2.0-main/server/email.ts")

def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise RuntimeError(f"Unable to find block to replace:\n{old[:120]}...")
    return text.replace(old, new, 1)

def remove_block(text: str, pattern: str) -> str:
    new_text, count = re.subn(pattern, "", text, count=1, flags=re.DOTALL)
    if count == 0:
        raise RuntimeError(f"Unable to remove block via pattern: {pattern}")
    return new_text

def insert_after_line(text: str, line_fragment: str, insertion: str, count: int = 1) -> str:
    occurrences = 0
    parts = []
    start = 0
    while occurrences < count:
        idx = text.find(line_fragment, start)
        if idx == -1:
            break
        end_idx = idx + len(line_fragment)
        parts.append(text[start:end_idx])
        parts.append(insertion)
        start = end_idx
        occurrences += 1
    if occurrences < count:
        raise RuntimeError(f"Expected to insert after '{line_fragment}' {count} times, but only found {occurrences} occurrences")
    parts.append(text[start:])
    return "".join(parts)

def main() -> None:
    text = EMAIL_PATH.read_text()

    # Update imports
    text = replace_once(
        text,
        "import nodemailer from 'nodemailer';",
        "import { readFileSync } from 'node:fs';\nimport path from 'node:path';\nimport nodemailer from 'nodemailer';",
    )

    # Inject logo helpers after transporter creation
    text = replace_once(
        text,
        "// Create transporter\nconst transporter = nodemailer.createTransport(emailConfig);\n\n// Lightweight, non-sensitive health state for SMTP transporter\n",
        dedent(
            """// Create transporter\nconst transporter = nodemailer.createTransport(emailConfig);\n\nconst brandingDir = path.join(process.cwd(), 'assets', 'branding');\n\nconst inlineLogoFallback = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='80' viewBox='0 0 160 80'><rect width='160' height='80' rx='12' fill='%232196F3'/><rect x='20' y='16' width='120' height='10' rx='5' fill='white'/><rect x='20' y='35' width='120' height='10' rx='5' fill='white'/><rect x='20' y='54' width='120' height='10' rx='5' fill='white'/></svg>`;\n\nconst loadLogoDataUri = (fileName: string, fallback = inlineLogoFallback): string => {\n  try {\n    const fileBuffer = readFileSync(path.join(brandingDir, fileName));\n    const base64 = Buffer.from(fileBuffer).toString('base64');\n    return `data:image/svg+xml;base64,${base64}`;\n  } catch (error) {\n    console.warn(`ChainSync logo asset missing (${fileName}). Falling back to inline SVG.`, error);\n    return fallback;\n  }\n};\n\nconst CHAIN_SYNC_LOGO_SOLID = loadLogoDataUri('chainsync-logo-solid.svg');\nconst CHAIN_SYNC_LOGO_OUTLINE = loadLogoDataUri('chainsync-logo-outline.svg');\n\nconst renderLogo = (variant: 'solid' | 'outline' = 'solid', size = 110, marginBottom = 12) => {\n  const src = variant === 'solid' ? CHAIN_SYNC_LOGO_SOLID : CHAIN_SYNC_LOGO_OUTLINE;\n  return `<img src=\"${src}\" alt=\"ChainSync logo\" width=\"${size}\" height=\"${size}\" style=\"display: block; margin: 0 auto ${marginBottom}px;\" />`;\n};\n\n// Lightweight, non-sensitive health state for SMTP transporter\n"""
        ),
    )

    # Remove inline SVG block in signup OTP email
    text = remove_block(
        text,
        r"\n\s+const logoSvg = <svg[\s\S]+?const logoDataUri = `data:image/svg\+xml;utf8,[^`]+`;\n",
    )

    # Trial reminder header
    text = replace_once(
        text,
        '              <td style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); padding: 32px 24px; text-align: center;">\n                <h1',
        "              <td style=\"background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); padding: 32px 24px; text-align: center;\">\n                ${renderLogo('outline', 110, 12)}\n                <h1",
    )

    # Staff access header
    text = replace_once(
        text,
        '      <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 20px; text-align: center;">\n        <h1',
        "      <div style=\"background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 20px; text-align: center;\">\n        ${renderLogo('outline', 96, 10)}\n        <h1",
    )

    # Email verification header
    text = replace_once(
        text,
        '      <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 20px; text-align: center;">\n        <h1',
        "      <div style=\"background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 20px; text-align: center;\">\n        ${renderLogo('outline', 96, 10)}\n        <h1",
    )

    # Signup OTP header (replace legacy <img>)
    text = replace_once(
        text,
        '                <img src="${logoDataUri}" alt="ChainSync" width="140" height="auto" style="display: block; margin: 0 auto 12px;" />',
        "                ${renderLogo('outline', 120, 12)}",
    )

    # Shared purple gradient headers
    text = text.replace(
        '        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">\n          <h1 style="color: white; margin: 0;">ChainSync</h1>',
        '        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">\n          ${renderLogo(\'outline\', 96, 10)}\n          <h1 style="color: white; margin: 0;">ChainSync</h1>'
    )

    EMAIL_PATH.write_text(text)

if __name__ == '__main__':
    main()
