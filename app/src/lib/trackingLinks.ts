// Free public tracking pages — no API, no cost, unlimited. "Open tracking" jumps
// to the carrier's own page for this container/BL; ShipsGo covers any carrier as
// the fallback. The user copies the page text back into "Paste update" and the AI
// structures it onto the shipment.

export function carrierTrackingUrl(scac: string | null | undefined, num: string): string {
  const n = encodeURIComponent(num.trim());
  switch (scac) {
    case 'MAEU':
      return `https://www.maersk.com/tracking/${n}`;
    case 'MSCU':
      return `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`;
    case 'CMDU':
      return `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${n}`;
    case 'HLCU':
      return `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}`;
    case 'ONEY':
      return `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${n}`;
    case 'COSU':
      return `https://elines.coscoshipping.com/ebusiness/cargotracking?number=${n}`;
    case 'EGLV':
      return `https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do?BL=${n}`;
    case 'OOLU':
      return `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?ctrnbr=${n}`;
    case 'ZIMU':
      return `https://www.zim.com/tools/track-a-shipment?consnumber=${n}`;
    default:
      // Unknown carrier: a Google search always lands on the carrier's own FREE
      // tracking page (ShipsGo/SeaRates web credits are limited). For Indian
      // ports, ldb.co.in also tracks any container for free.
      return `https://www.google.com/search?q=${encodeURIComponent('container tracking ' + num.trim())}`;
  }
}
