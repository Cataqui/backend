use super::*;
#[test]
fn opaque_rgba_encodes_as_webp_with_the_qualified_encoder() {
    let image = vec![255; 16 * 16 * 4];
    let bytes = encode_webp(&image, 16, 16, 80.0, 2).unwrap();
    assert_eq!(&bytes[0..4], b"RIFF");
    assert_eq!(&bytes[8..12], b"WEBP");
}
#[test]
fn short_rgba_is_rejected_before_native_access() {
    assert!(encode_webp(&[0; 8], 16, 16, 80.0, 2).is_err());
}

#[test]
fn invalid_webp_dimensions_quality_and_method_fail_with_owned_errors() {
    assert!(encode_webp(&[], 0, 1, 80.0, 2).is_err());
    assert!(encode_webp(&[], 1, 0, 80.0, 2).is_err());
    let image = vec![255; 16 * 16 * 4];
    assert!(encode_webp(&image, 16, 16, 101.0, 2).is_err());
    assert!(encode_webp(&image, 16, 16, 80.0, 7).is_err());
}

#[test]
fn oversized_webp_edges_are_rejected_before_size_arithmetic_or_native_access() {
    for (width, height) in [
        (1_u32 << 31, 1_u32 << 31),
        (u32::MAX, u32::MAX),
        (16384, 1),
        (1, 16384),
    ] {
        assert!(encode_webp(&[], width, height, 80.0, 2).is_err());
    }
    let widest_valid_row = vec![255; 16383 * 4];
    assert!(encode_webp(&widest_valid_row, 16383, 1, 80.0, 2).is_ok());
}

#[test]
fn non_finite_webp_quality_is_rejected_before_encoding() {
    let image = vec![255; 16 * 16 * 4];
    for quality in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
        assert!(encode_webp(&image, 16, 16, quality, 2).is_err());
    }
}
