use super::*;

fn _scene() -> Scene {
    serde_json::from_value(serde_json::json!({
        "width": 41, "height": 67, "pixelRatio": 1.5, "background": "#f7f3e8",
        "commands": [
            {"type":"fill","color":"#a8c9ef","clip":[0,0,20.25,67],"paths":[[[-3.5,-2.2],[40.1,8.5],[42.3,70.1],[1.2,66.4]]]},
            {"type":"stroke","color":"#f8b932","width":1.5,"clip":[0,0,20.25,67],"paths":[[[-2.3,2.7],[43.1,59.7]]]},
            {"type":"fill","color":"#a8c9ef","clip":[20.25,0,41,67],"paths":[[[-3.5,-2.2],[40.1,8.5],[42.3,70.1],[1.2,66.4]]]},
            {"type":"stroke","color":"#f8b932","width":1.5,"clip":[20.25,0,41,67],"paths":[[[-2.3,2.7],[43.1,59.7]]]}
        ]
    })).unwrap()
}

fn _target(scene: &Scene) -> Pixmap {
    let (width, height) = crate::scene::_dimensions(scene).unwrap();
    let mut image = Pixmap::new(width, height).unwrap();
    image.fill(crate::scene::_color(&scene.background, 1.0).unwrap());
    image
}

#[test]
fn integer_rois_keep_every_pixel_opaque_and_match_between_worker_counts() {
    let scene = _scene();
    let mut one = _target(&scene);
    let mut two = _target(&scene);
    let first = draw_geometry(&scene, &mut one, 1).unwrap();
    let second = draw_geometry(&scene, &mut two, 2).unwrap();
    assert_eq!(first.roi_pixels, first.frame_pixels);
    assert_eq!(first.clip_groups, 2);
    assert_eq!(second.clip_groups, 2);
    assert_eq!(one.data(), two.data());
    assert!(one.pixels().iter().all(|pixel| pixel.alpha() == 255));
}

#[test]
fn overlapping_or_missing_clips_and_interleaving_fail_before_target_changes() {
    for variant in 0..3 {
        let mut scene = _scene();
        match variant {
            0 => {
                if let Command::Fill { clip, .. } = &mut scene.commands[0] {
                    *clip = None;
                }
            }
            1 => {
                if let Command::Fill { clip, .. } = &mut scene.commands[0] {
                    *clip = Some([0.0, 0.0, 41.0, 67.0]);
                }
            }
            2 => scene.commands.insert(
                1,
                serde_json::from_value(
                    serde_json::json!({"type":"text","text":"Interleaved","x":3,"y":4,"size":8,"color":"#fff"}),
                )
                .unwrap(),
            ),
            _ => unreachable!(),
        }
        let mut target = _target(&scene);
        let before = target.data().to_vec();
        assert!(draw_geometry(&scene, &mut target, 2).is_err());
        assert_eq!(target.data(), before);
    }
}

#[test]
fn irregular_or_nonbinary_masks_are_rejected() {
    for bytes in [
        vec![0, 255, 0, 0, 0, 255, 255, 0],
        vec![0, 254, 0, 0, 0, 255, 0, 0],
        vec![0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0],
    ] {
        let height = bytes.len() as u32 / 4;
        let mut mask = Mask::new(4, height).unwrap();
        mask.data_mut().copy_from_slice(&bytes);
        assert!(_bounds(&mask).is_err());
    }
}

#[test]
fn clips_separated_in_each_direction_draw_without_ownership_conflicts() {
    for (direction, clip, point) in [
        ("left", [2, 8, 6, 12], [3, 9]),
        ("right", [14, 8, 18, 12], [15, 9]),
        ("above", [8, 2, 12, 6], [9, 3]),
        ("below", [8, 14, 12, 18], [9, 15]),
    ] {
        let scene: Scene = serde_json::from_value(serde_json::json!({
            "width": 24, "height": 24, "background": "#f7f3e8",
            "commands": [
                {"type":"fill","color":"#ff0000","clip":[8,8,12,12],"paths":[[[-100,-100],[100,-100],[100,100],[-100,100]]]},
                {"type":"fill","color":"#0000ff","clip":clip,"paths":[[[-100,-100],[100,-100],[100,100],[-100,100]]]}
            ]
        })).unwrap();
        let mut target = _target(&scene);

        let metrics = draw_geometry(&scene, &mut target, 2).unwrap();

        assert_eq!(metrics.clip_groups, 2, "{direction}");
        assert_eq!(metrics.roi_pixels, 32, "{direction}");
        let anchor = (9 * target.width() as usize + 9) * 4;
        let separated = (point[1] as usize * target.width() as usize + point[0] as usize) * 4;
        assert_eq!(
            &target.data()[anchor..anchor + 4],
            [255, 0, 0, 255],
            "{direction}"
        );
        assert_eq!(
            &target.data()[separated..separated + 4],
            [0, 0, 255, 255],
            "{direction}"
        );
        assert_eq!(&target.data()[0..4], [247, 243, 232, 255], "{direction}");
    }
}

#[test]
fn binary_masks_with_shifted_or_narrower_middle_rows_are_rejected() {
    for (shape, bytes) in [
        (
            "shifted origin",
            [0, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0],
        ),
        (
            "narrower width",
            [0, 255, 255, 255, 0, 0, 255, 255, 0, 0, 0, 255, 255, 255, 0],
        ),
    ] {
        let mut mask = Mask::new(5, 3).unwrap();
        mask.data_mut().copy_from_slice(&bytes);

        let error = _bounds(&mask).unwrap_err();

        assert!(
            error.contains("rectangular binary clip masks"),
            "{shape}: {error}"
        );
    }
}

#[test]
fn transparent_background_preserves_the_target_for_ordered_fallback() {
    let mut scene = _scene();
    scene.background = "#ffffff80".to_string();
    let mut target = _target(&scene);
    let before = target.data().to_vec();

    let error = draw_geometry(&scene, &mut target, 2).unwrap_err();

    assert!(error.contains("opaque scene background"));
    assert_eq!(target.data(), before);
}

#[test]
fn an_empty_scene_preserves_the_background() {
    let mut scene = _scene();
    scene.commands.clear();
    let mut target = _target(&scene);
    let before = target.data().to_vec();

    let metrics = draw_geometry(&scene, &mut target, 2).unwrap();

    assert_eq!(metrics.workers, 1);
    assert_eq!(metrics.clip_groups, 0);
    assert_eq!(metrics.roi_pixels, 0);
    assert_eq!(target.data(), before);
}

#[test]
fn geometry_clipped_outside_the_frame_draws_no_pixels() {
    let mut scene = _scene();
    for command in &mut scene.commands {
        match command {
            Command::Fill { clip, .. } | Command::Stroke { clip, .. } => {
                *clip = Some([-20.0, -20.0, -1.0, -1.0]);
            }
            Command::Text { .. } | Command::Image { .. } | Command::Landmarks { .. } => {
                unreachable!();
            }
        }
    }
    let mut target = _target(&scene);
    let before = target.data().to_vec();

    let metrics = draw_geometry(&scene, &mut target, 2).unwrap();

    assert_eq!(metrics.clip_groups, 1);
    assert_eq!(metrics.roi_pixels, 0);
    assert_eq!(target.data(), before);
}

#[test]
fn a_partial_clip_changes_only_its_device_pixel_rectangle() {
    let scene: Scene = serde_json::from_value(serde_json::json!({
        "width": 48, "height": 36, "pixelRatio": 1.5, "background": "#f7f3e8",
        "commands": [{
            "type": "fill", "color": "#206040", "clip": [4,6,20,18],
            "paths": [[[-100,-100],[100,-100],[100,100],[-100,100]]]
        }]
    }))
    .unwrap();
    let mut target = _target(&scene);

    let metrics = draw_geometry(&scene, &mut target, 2).unwrap();

    assert_eq!(metrics.roi_pixels, 24 * 18);
    for (index, pixel) in target.data().chunks_exact(4).enumerate() {
        let x = index as u32 % target.width();
        let y = index as u32 / target.width();
        let expected = if (6..30).contains(&x) && (9..27).contains(&y) {
            [32, 96, 64, 255]
        } else {
            [247, 243, 232, 255]
        };
        assert_eq!(pixel, expected, "pixel {x},{y}");
    }
}

#[test]
fn empty_paths_and_zero_width_strokes_draw_no_ink() {
    let scene: Scene = serde_json::from_value(serde_json::json!({
        "width": 18, "height": 18, "background": "#f7f3e8",
        "commands": [
            {"type":"fill","color":"#ff0000","clip":[2,3,15,16],"paths":[]},
            {"type":"stroke","color":"#0000ff","width":0,"clip":[2,3,15,16],"paths":[[[0,0],[18,18]]]}
        ]
    })).unwrap();
    let mut target = _target(&scene);
    let before = target.data().to_vec();

    let metrics = draw_geometry(&scene, &mut target, 2).unwrap();

    assert_eq!(metrics.clip_groups, 1);
    assert_eq!(target.data(), before);
}

#[test]
fn malformed_paint_or_dash_preserves_the_target_before_compositing() {
    for (variant, expected) in [(0, "CSS color"), (1, "stroke dash"), (2, "CSS color")] {
        let mut scene = _scene();
        let command = if variant == 1 {
            &mut scene.commands[1]
        } else {
            &mut scene.commands[0]
        };
        match command {
            Command::Stroke { dash, .. } => {
                *dash = vec![1.0, -1.0];
            }
            Command::Fill { color, clip, .. } => {
                *color = "not-a-color".to_string();
                if variant == 2 {
                    *clip = Some([-20.0, -20.0, -1.0, -1.0]);
                }
            }
            Command::Landmarks { .. } | Command::Text { .. } | Command::Image { .. } => {
                panic!("fixture must select a fill or stroke command");
            }
        }
        let mut target = _target(&scene);
        let before = target.data().to_vec();

        let error = draw_geometry(&scene, &mut target, 2).unwrap_err();

        assert!(error.contains(expected), "{error}");
        assert_eq!(target.data(), before);
    }
}

#[test]
fn an_invalid_clip_rectangle_preserves_the_target() {
    let mut scene = _scene();
    if let Command::Fill { clip, .. } = &mut scene.commands[0] {
        *clip = Some([0.0, 0.0, -1.0, 2.0]);
    }
    let mut target = _target(&scene);
    let before = target.data().to_vec();

    let error = draw_geometry(&scene, &mut target, 2).unwrap_err();

    assert!(error.contains("invalid ROI clip rectangle"));
    assert_eq!(target.data(), before);
}

#[test]
fn an_invalid_background_is_rejected_before_target_changes() {
    let mut scene = _scene();
    let mut target = _target(&scene);
    let before = target.data().to_vec();
    scene.background = "not-a-color".to_string();

    let error = draw_geometry(&scene, &mut target, 2).unwrap_err();

    assert!(error.contains("CSS color"));
    assert_eq!(target.data(), before);
}
