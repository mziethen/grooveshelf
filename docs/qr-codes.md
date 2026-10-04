# QR record links

Open a copy's details and choose **Show QR code**. The code opens that copy's detail view using its stable internal ID. Changing the LP inventory number does not change the link. If the copy is deleted, the link reports a missing record; reusing its old inventory number does not redirect the old code to another copy.

## Collection address

The address initially uses the current browser origin. Replace it with the Pi's hostname or LAN IP and port if needed, for example `http://grooveshelf.local:8080` or `http://192.168.1.50:8080`. The scanning phone must be on a network that can reach the installation. `localhost` and `127.0.0.1` refer to the scanning device, so they are unsuitable for codes intended for another device.

Choose **Generate QR code** after editing the address. HTTP and HTTPS origins are supported; credentials, non-root paths, queries, and fragments are rejected. A valid generated address is remembered per browser and shared with the label form. Changing the address hides the previous result until it is generated again. If the Pi's address changes, existing printed links need regeneration unless its hostname remains reachable.

The read-only **Record link** field can be selected and copied using the browser's normal copy controls. **Download QR SVG** saves a standalone vector code for the current copy. QR codes are generated locally using the vendored [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) library; no copy IDs or collection data are sent to a third-party QR service. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## QR labels

Open **Print labels**, select copies, and enable **Include QR record links**. Review the collection address, build the preview, and print or download the standalone HTML. Each label contains a black code on white with a four-module quiet zone and its LP number below. Plain inventory labels remain the initial default.

QR labels require at least 30 × 30 mm; the calculated QR square must also provide at least 0.4 mm per module, including the quiet zone. Dense codes may require larger labels or a shorter hostname. The standard 63.5 × 38.1 mm layout works with typical LAN addresses. Print at 100% / actual size and test the code and alignment on plain paper before using label stock. Print-driver scaling, label material, camera, and printer quality affect scan reliability; these size checks do not replace a physical print test.

Preview, SVG download, and printed HTML keep their own code graphics and do not depend on a remote image host or CDN. A downloaded document retains its generated address and IDs. Changes to selection, geometry, QR mode, or address invalidate the live preview. Reprint the text label after renumbering if you want the printed LP number updated; its existing QR link remains valid.

Scanning uses the phone's normal QR reader. It opens details without assigning an NFC tag or starting a listening session. GrooveShelf does not implement in-app camera scanning here. Keep the installation on your trusted home network; QR links do not add authentication or make the Pi accessible from elsewhere.

## Validation

An independent decoder reads the rendered codes and standalone print document in browser tests. Tests also cover invalid addresses, credentials, remembered origins, renumbering, missing records, plain-label compatibility, print-size checks, preview invalidation, all themes, and mobile layout. Physical phone/printer verification remains a setup step on the target hardware.
