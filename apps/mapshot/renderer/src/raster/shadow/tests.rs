use super::*;

#[test]
fn badge_shadow_is_black_at_twenty_percent_with_space_for_the_blur() {
    let mut badge = Pixmap::new(32, 32).unwrap();
    badge.fill(tiny_skia::Color::WHITE);
    let shadow = super::badge_shadow(&badge).unwrap();
    assert_eq!((shadow.width(), shadow.height()), (44, 44));
    assert_eq!(shadow.pixel(22, 22).unwrap().alpha(), 51);
    assert!(shadow.pixel(5, 22).unwrap().alpha() > 0);
    assert!(
        shadow
            .data()
            .chunks_exact(4)
            .all(|pixel| pixel[..3] == [0, 0, 0] && pixel[3] <= 51)
    );
}

#[test]
fn text_shadow_scales_with_density_and_obeys_the_drawing_clip() {
    let path = tiny_skia::PathBuilder::from_rect(
        tiny_skia::Rect::from_xywh(5.0, 5.0, 10.0, 10.0).unwrap(),
    );
    for ratio in [1.0, 2.0] {
        let mut image = Pixmap::new(40, 40).unwrap();
        text_shadow(&mut image, &path, ratio, None).unwrap();
        assert!(
            image
                .pixel((4.0 * ratio) as u32, (10.0 * ratio) as u32)
                .unwrap()
                .alpha()
                > 0
        );
        assert!(
            image
                .pixel((10.0 * ratio) as u32, (10.0 * ratio) as u32)
                .unwrap()
                .alpha()
                > 0
        );
        let mut clipped = Pixmap::new(40, 40).unwrap();
        let clip = Mask::new(40, 40).unwrap();
        text_shadow(&mut clipped, &path, ratio, Some(&clip)).unwrap();
        assert!(clipped.data().iter().all(|value| *value == 0));
    }
}

#[test]
fn blur_reports_invalid_sigma() {
    let mask = Mask::new(4, 4).unwrap();
    assert!(matches!(_blur(&mask, 0.0), Err(error) if error.starts_with("shadow blur:")));
}
