import assert from "node:assert/strict"
import {
  resolveCustomerPortalImage,
  resolvePublicListingImage,
  resolveStockDisplayImage,
} from "./product-assets"

const publicPhoto = "https://pub-example.r2.dev/catalog/real-photo.webp"

const usedIphone = {
  brand: "Apple",
  category: "iPhone",
  model: "iPhone 16",
  color: "Ultramarine",
  uploadedImageUrl: publicPhoto,
  uploadedThumbnailUrl: publicPhoto,
}

assert.equal(resolvePublicListingImage(usedIphone).src, publicPhoto)
assert.equal(resolvePublicListingImage(usedIphone).source, "uploaded")

const stockImage = resolveStockDisplayImage(usedIphone)
assert.notEqual(stockImage.src, publicPhoto)
assert.equal(stockImage.source, "static_asset")
assert.equal(stockImage.src, "/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp")

const portalImage = resolveCustomerPortalImage(usedIphone)
assert.notEqual(portalImage.src, publicPhoto)
assert.equal(portalImage.source, "static_asset")

const accessoryImage = resolveStockDisplayImage({
  brand: "Apple",
  category: "Acessorios",
  model: "Apple Pencil USB-C",
  color: "White",
  uploadedImageUrl: publicPhoto,
})

assert.notEqual(accessoryImage.src, publicPhoto)
assert.notEqual(accessoryImage.src, "/product-assets/fallbacks/iphone.webp")
assert.equal(accessoryImage.kind, "generic-device")
