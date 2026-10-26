# Xprinter XP-80TS receipt printing

The cashier receipt uses the browser print path and is formatted for 80 mm thermal paper. The printable receipt body is 72 mm wide, leaving 4 mm on each side for common XP-80TS hardware margins. The application does not send data directly to the printer and does not print on page load or refresh.

## Windows 10 setup

1. Install the XP-80TS Windows driver supplied by Xprinter, connect the USB printer, and print a Windows test page.
2. In **Settings > Devices > Printers & scanners**, set the XP-80TS as the default printer for the cashier Windows account.
3. In the printer driver's **Printing preferences**, choose the 80 mm receipt roll (often labelled `80 x 297 mm` or `80 mm Receipt`) and set margins to zero if the driver exposes that setting. Do not use A4 or Letter.
4. Disable header/footer printing in Chrome's print settings. Keep scale at 100% and margins at None; the app supplies the receipt layout.

## Chrome normal and kiosk printing

The receipt's **طباعة** button opens the standard Chrome print workflow. This remains the manual fallback and lets the cashier choose a printer if necessary.

For a dedicated cashier workstation, start Chrome with the installed XP-80TS set as the Windows default printer:

```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --app=https://YOUR-CAFE-URL/cashier
```

`--kiosk-printing` makes Chrome submit print jobs to the default printer without showing the print preview. It is a Chrome workstation configuration, not something the web app can or should bypass with JavaScript. Test the exact driver, paper size, and cashier account after Windows or driver updates.

## Operational checks

- Press the receipt print button once and wait for the browser print workflow to finish before pressing it again; the UI disables the button while a print is pending.
- Use the 80 mm option in the receipt preview for XP-80TS. The existing 58 mm option remains available for compatible hardware.
- Verify an Arabic receipt in Chrome preview after any logo, font, printer-driver, or browser update.
