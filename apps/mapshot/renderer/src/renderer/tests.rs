use super::*;

#[test]
fn alternative_positions_preserve_pixels_and_stop_at_the_first_admitted_position() {
    let mut renderer = _renderer();
    let direct = serde_json::json!({
        "width":96,"height":96,"background":"#fff","commands":[{
            "type":"text","id":"label","text":"Park","x":48,"y":48,
            "size":10,"color":"#000","anchor":"center","edgeMargin":6
        }]
    });
    let expected = renderer
        ._test_render(_scene(direct.clone()), 0.0, 0.0)
        .unwrap();
    let mut alternatives = direct;
    alternatives["commands"][0]["alternatives"] = serde_json::json!([
        {"x":0,"y":0,"anchor":"left"},
        {"x":48,"y":48,"anchor":"center"},
        {"x":80,"y":80,"anchor":"right"}
    ]);
    let scene = _scene(alternatives.clone());
    let actual = renderer
        ._render(&serde_json::Value::Null, &scene, 0.0, 0.0)
        .unwrap();
    assert_eq!(actual.image_base64, expected.image_base64);
    let metrics = actual.metrics.unwrap();
    assert_eq!(metrics.accepted_label_ids, ["label"]);
    assert_eq!(
        metrics.shaped_glyphs,
        expected.metrics.unwrap().shaped_glyphs * 2
    );
    let Command::Text { text } = &scene.commands[0] else {
        panic!("text fixture")
    };
    assert_eq!(
        (text.x, text.y, text.anchor.as_str()),
        (Some(48.0), Some(48.0), "center")
    );
    assert_eq!(text.alternatives.len(), 3);
    let repeated = renderer
        ._test_render(_scene(alternatives), 0.0, 0.0)
        .unwrap();
    assert_eq!(repeated.image_base64, actual.image_base64);
}

fn _renderer() -> Renderer {
    let fonts = std::env::var_os("MAPSHOT_FONT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist/native/assets/fonts")
        });
    Renderer::new(&fonts).expect("prepared Mapshot fonts")
}

fn _scene(value: serde_json::Value) -> Scene {
    serde_json::from_value(value).unwrap()
}

impl Renderer {
    fn _test_render(
        &mut self,
        mut scene: Scene,
        parse_ms: f64,
        parse_cpu_ms: f64,
    ) -> Result<Reply, String> {
        scene.expand_landmarks();
        self._render(&serde_json::Value::Null, &scene, parse_ms, parse_cpu_ms)
    }
}

fn _decode_webp(reply: &Reply) -> Vec<u8> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(reply.image_base64.as_ref().unwrap())
        .unwrap();
    assert_eq!(
        base64::engine::general_purpose::STANDARD.encode(&bytes),
        *reply.image_base64.as_ref().unwrap()
    );
    assert_eq!(bytes.len(), reply.bytes.unwrap());
    assert_eq!(&bytes[..4], b"RIFF");
    assert_eq!(&bytes[8..12], b"WEBP");
    let width = reply.width.unwrap() as usize;
    let height = reply.height.unwrap() as usize;
    let mut pixels = vec![0; width * height * 4];
    // The valid production response dimensions bound this caller-owned test
    // buffer; libwebp returns null rather than writing beyond its exact size.
    let decoded = unsafe {
        libwebp_sys::WebPDecodeRGBAInto(
            bytes.as_ptr(),
            bytes.len(),
            pixels.as_mut_ptr(),
            pixels.len(),
            width as i32 * 4,
        )
    };
    assert_eq!(decoded, pixels.as_mut_ptr());
    pixels
}

#[test]
fn high_zoom_renders_visible_polygons_with_normally_rounded_offscreen_vertices() {
    let mut renderer = _renderer();
    // A source-z15 water polygon covers its entire 512-unit tile.
    let tile_bytes = [
        0x1a_u8, 32, 0x0a, 5, b'w', b'a', b't', b'e', b'r', 0x12, 18, 0x18, 3, 0x22, 14, 9, 0, 0,
        26, 0x80, 8, 0, 0, 0x80, 8, 0xff, 7, 0, 15, 0x28, 0x80, 4, 0x78, 2,
    ];
    let request: Request = serde_json::from_value(serde_json::json!({
        "id":"high-zoom-water","op":"render","map":{
            "camera":{"latitude":0,"longitude":-46.6333,"zoom":26,"width":480,"height":480,"pixelRatio":2},
            "tiles":[{"key":"water-z15","address":{"z":15,"x":12139,"y":16384},
                "bytes":base64::engine::general_purpose::STANDARD.encode(tile_bytes)}],
            "landmarks":{"candidates":[],"style":{"badgeRadius":9,
                "badgeStrokeWidth":1.25,"labelGap":3,"edgeMargin":6,"labelFontSize":10,"labelMaxWidth":80,
                "labelMaxLines":3,"labelLineHeight":12,"labelLetterSpacing":-0.2,"labelHaloWidth":2}}
        }
    })).unwrap();
    let reply = renderer.handle(request, 0.0, 0.0).unwrap();
    let pixels = _decode_webp(&reply);
    assert_eq!((reply.width, reply.height), (Some(960), Some(960)));
    let water = &pixels[(720 * 960 + 480) * 4..][..4];
    assert!(water[2].saturating_sub(water[0]) > 80 && water[1] > 200);
}

fn _temporary_path(name: &str) -> PathBuf {
    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    std::env::temp_dir().join(format!(
        "mapshot-renderer-{}-{}-{name}",
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ))
}

fn _reference_scene(width: u32, height: u32, step: u32, label: &str) -> Scene {
    let candidates = (40..height.saturating_sub(30))
        .step_by(step as usize)
        .flat_map(|y| (40..width.saturating_sub(30)).step_by(step as usize).map(move |x| (x, y)))
        .enumerate()
        .map(|(rank, (x, y))| serde_json::json!({
            "id":format!("landmark:{rank}"),"rank":rank,"center":[x,y],
            "sourceMinZoom":15,
            "labels":[{"text":label,"wordEnds":[label.len()],"graphemeEnds":
                label.char_indices().map(|(offset, value)| offset + value.len_utf8()).collect::<Vec<_>>() }],
            "badge":{"path":PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/renderer/fixtures/badge.png"),"logicalSize":26},
            "textColor":"#008236"
        })).collect::<Vec<_>>();
    _scene(serde_json::json!({
        "width":width,"height":height,"background":"#fff","commands":[{
            "type":"landmarks","priority":2200000,"viewZoom":13,"candidates":candidates,
            "style":{"badgeRadius":9,"badgeStrokeWidth":1.25,"labelGap":3,"edgeMargin":6,
                "labelFontSize":10,"labelMaxWidth":80,"labelMaxLines":3,"labelLineHeight":12,
                "labelLetterSpacing":-0.2,"labelHaloWidth":2}
        }]
    }))
}

#[test]
fn adaptive_references_use_viewport_space_without_a_fixed_count() {
    let mut renderer = _renderer();
    let small = renderer
        ._test_render(_reference_scene(240, 240, 45, "Park"), 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    let large = renderer
        ._test_render(_reference_scene(720, 720, 45, "Park"), 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    assert!(small.accepted_labels > 0);
    assert!(large.accepted_labels > small.accepted_labels);
    assert!(large.accepted_labels > 7);
}

#[test]
fn joint_references_choose_the_best_marginal_candidate_independently_of_input_order_or_rank() {
    let mut renderer = _renderer();
    let mut first = _reference_scene(480, 480, 100, "Park");
    let Command::Landmarks { layout } = &mut first.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(2);
    layout.candidates[0].center = [240.0, 240.0];
    layout.candidates[0].source_min_zoom = Some(17.0);
    layout.candidates[1].center = [240.0, 240.0];
    layout.candidates[1].source_min_zoom = Some(11.0);
    let first = renderer._test_render(first, 0.0, 0.0).unwrap();
    let mut second = _reference_scene(480, 480, 100, "Park");
    let Command::Landmarks { layout } = &mut second.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(2);
    layout.candidates[0].center = [240.0, 240.0];
    layout.candidates[0].source_min_zoom = Some(17.0);
    layout.candidates[0].rank = 10000.0;
    layout.candidates[1].center = [240.0, 240.0];
    layout.candidates[1].source_min_zoom = Some(11.0);
    layout.candidates[1].rank = 20000.0;
    layout.candidates.reverse();
    let second = renderer._test_render(second, 0.0, 0.0).unwrap();
    assert_eq!(first.metrics.unwrap().accepted_label_ids, ["landmark:1"]);
    assert_eq!(second.metrics.unwrap().accepted_label_ids, ["landmark:1"]);
    assert_eq!(first.image_base64, second.image_base64);
}

#[test]
fn joint_references_normalize_only_against_labels_legal_after_higher_priority_context() {
    let mut renderer = _renderer();
    let mut scene = _reference_scene(480, 480, 100, "Park");
    let Command::Landmarks { layout } = &mut scene.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(3);
    layout.view_zoom = 5.0;
    for candidate in &mut layout.candidates {
        candidate.source_min_zoom = Some(17.0);
    }
    layout.candidates[0].center = [120.0, 120.0];
    layout.candidates[1].center = [360.0, 360.0];
    layout.candidates[2].center = [240.0, 240.0];
    layout.candidates[2].source_min_zoom = Some(11.0);
    scene.commands.push(Command::Text { text: Box::new(serde_json::from_value(serde_json::json!({
        "id":"city","text":"City Context","x":240,"y":240,"size":26,"color":"#000", "collide":true,"priority":3000000
    })).unwrap()) });
    let metrics = renderer
        ._test_render(scene, 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    assert!(metrics.accepted_label_ids.iter().any(|id| id == "city"));
    assert!(
        metrics
            .accepted_label_ids
            .iter()
            .any(|id| id == "landmark:0")
    );
    assert!(
        metrics
            .accepted_label_ids
            .iter()
            .any(|id| id == "landmark:1")
    );
    assert!(
        !metrics
            .accepted_label_ids
            .iter()
            .any(|id| id == "landmark:2")
    );
}

#[test]
fn joint_references_charge_actual_label_footprint_and_repeat_at_each_raster_density() {
    let mut renderer = _renderer();
    for density in [1.0, 2.0, 3.0] {
        let mut scene = _reference_scene(480, 480, 50, "Park");
        scene.pixel_ratio = density;
        let Command::Landmarks { layout } = &mut scene.commands[0] else {
            panic!("landmarks")
        };
        layout.candidates.truncate(2);
        for candidate in &mut layout.candidates {
            candidate.center = [240.0, 240.0];
        }
        let long = "Historic Regional Museum";
        layout.candidates[0].labels[0].text = long.to_owned();
        layout.candidates[0].labels[0].word_ends = vec![8, 17, 24];
        layout.candidates[0].labels[0].grapheme_ends = long
            .char_indices()
            .map(|(offset, value)| offset + value.len_utf8())
            .collect();
        let metrics = renderer
            ._test_render(scene, 0.0, 0.0)
            .unwrap()
            .metrics
            .unwrap();
        assert_eq!(metrics.accepted_label_ids, ["landmark:1"]);
    }
}

#[test]
fn adaptive_references_omit_redundant_neighbors_and_keep_distant_references() {
    let mut renderer = _renderer();
    let mut scene = _reference_scene(480, 480, 100, "Park");
    let Command::Landmarks { layout } = &mut scene.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(3);
    layout.candidates[0].center = [140.0, 140.0];
    // Thirty-pixel badge boxes fit separately; the second reference adds too little coverage.
    layout.candidates[1].center = [140.0, 172.0];
    layout.candidates[2].center = [360.0, 360.0];
    let metrics = renderer
        ._test_render(scene, 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    assert_eq!(metrics.accepted_label_ids.len(), 2);
    assert!(
        metrics
            .accepted_label_ids
            .contains(&"landmark:2".to_owned())
    );
    assert!(
        metrics
            .accepted_label_ids
            .contains(&"landmark:0".to_owned())
            || metrics
                .accepted_label_ids
                .contains(&"landmark:1".to_owned())
    );
}

fn _locality_reference_scene(center: [f64; 2]) -> Scene {
    let mut scene = _reference_scene(480, 480, 100, "Civic Museum");
    let Command::Landmarks { layout } = &mut scene.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(1);
    layout.candidates[0].center = center;
    layout.candidates[0].source_min_zoom = Some(11.0);
    let mut city: TextCommand = serde_json::from_value(serde_json::json!({
        "id":"city","text":"São Paulo","x":240,"y":240,"size":22,"color":"#333",
        "anchor":"center","collide":true,"padding":4,"priority":2300000
    }))
    .unwrap();
    city.locality = true;
    scene.commands.push(Command::Text {
        text: Box::new(city),
    });
    scene
}

#[test]
fn locality_names_keep_their_geographic_anchor_and_clear_central_reference_badges() {
    let mut renderer = _renderer();
    let scene = _locality_reference_scene([240.0, 240.0]);
    let Command::Text { text } = &scene.commands[1] else {
        panic!("city")
    };
    let original = (text.x, text.y, text.text.clone());
    let reply = renderer._test_render(scene, 0.0, 0.0).unwrap();
    let metrics = reply.metrics.unwrap();
    assert!(metrics.accepted_label_ids.contains(&"city".to_owned()));
    assert!(
        metrics
            .accepted_label_ids
            .contains(&"landmark:0".to_owned())
    );
    let repeated = _locality_reference_scene([240.0, 240.0]);
    let Command::Text { text } = &repeated.commands[1] else {
        panic!("city")
    };
    assert_eq!((text.x, text.y, text.text.clone()), original);
    let repeated = renderer._test_render(repeated, 0.0, 0.0).unwrap();
    assert_eq!(repeated.image_base64, reply.image_base64);
}

#[test]
fn locality_names_preserve_centered_pixels_when_no_reference_needs_the_space() {
    let mut renderer = _renderer();
    let mut plain = _locality_reference_scene([100.0, 100.0]);
    let Command::Text { text } = &mut plain.commands[1] else {
        panic!("city")
    };
    text.locality = false;
    let expected = renderer._test_render(plain, 0.0, 0.0).unwrap();
    let actual = renderer
        ._test_render(_locality_reference_scene([100.0, 100.0]), 0.0, 0.0)
        .unwrap();
    assert_eq!(actual.image_base64, expected.image_base64);
    assert_eq!(
        actual.metrics.unwrap().accepted_label_ids,
        expected.metrics.unwrap().accepted_label_ids
    );
}

fn _add_context_name(scene: &mut Scene, point: [f32; 2], name: &str) {
    let Command::Text { text } = &scene.commands[1] else {
        panic!("city")
    };
    let mut second = text.clone();
    second.id = Some("second-context".to_owned());
    second.text = name.to_owned();
    second.x = Some(point[0]);
    second.y = Some(point[1]);
    second.priority -= 1.0;
    scene.commands.push(Command::Text { text: second });
}

#[test]
fn locality_alternatives_do_not_separate_identical_overlapping_primary_names() {
    let mut renderer = _renderer();
    for density in [1.0, 2.0, 3.0] {
        let mut scene = _locality_reference_scene([240.0, 240.0]);
        scene.pixel_ratio = density;
        _add_context_name(&mut scene, [246.0, 240.0], "São Paulo");
        let metrics = renderer
            ._test_render(scene, 0.0, 0.0)
            .unwrap()
            .metrics
            .unwrap();
        assert!(metrics.accepted_label_ids.contains(&"city".to_owned()));
        assert!(
            metrics
                .accepted_label_ids
                .contains(&"landmark:0".to_owned())
        );
        assert!(
            !metrics
                .accepted_label_ids
                .contains(&"second-context".to_owned())
        );
    }
}

#[test]
fn locality_alternatives_keep_distant_identical_names_and_different_nearby_names() {
    let mut renderer = _renderer();
    for (point, name) in [
        ([360.0, 80.0], "São Paulo"),
        ([246.0, 240.0], "Another District"),
    ] {
        let mut scene = _locality_reference_scene([240.0, 240.0]);
        _add_context_name(&mut scene, point, name);
        let metrics = renderer
            ._test_render(scene, 0.0, 0.0)
            .unwrap()
            .metrics
            .unwrap();
        assert!(metrics.accepted_label_ids.contains(&"city".to_owned()));
        assert!(
            metrics
                .accepted_label_ids
                .contains(&"second-context".to_owned())
        );
    }
}

#[test]
fn locality_alternatives_do_not_reserve_a_primary_name_when_all_positions_fail() {
    let mut renderer = _renderer();
    let mut scene = _locality_reference_scene([240.0, 240.0]);
    _add_context_name(&mut scene, [246.0, 240.0], "São Paulo");
    let Command::Text { text } = &mut scene.commands[2] else {
        panic!("second context")
    };
    text.size = 10.0;
    for (index, [x, y]) in [[190, 240], [190, 210], [190, 270], [120, 240], [360, 240]]
        .into_iter()
        .enumerate()
    {
        scene.commands.push(Command::Text {
            text: Box::new(
                serde_json::from_value(serde_json::json!({
                    "id":format!("blocker:{index}"),"text":"X","x":x,"y":y,"size":5,
                    "color":"#000","collide":true,"padding":0,"priority":3000000
                }))
                .unwrap(),
            ),
        });
    }
    let metrics = renderer
        ._test_render(scene, 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    assert!(!metrics.accepted_label_ids.contains(&"city".to_owned()));
    assert!(
        metrics
            .accepted_label_ids
            .contains(&"second-context".to_owned())
    );
}

#[test]
fn locality_names_preserve_the_primary_when_other_positions_leave_the_viewport() {
    let mut renderer = _renderer();
    let mut replies = Vec::new();
    for locality in [false, true] {
        let mut scene = _locality_reference_scene([60.0, 20.0]);
        scene.width = 120.0;
        scene.height = 40.0;
        let Command::Landmarks { layout } = &mut scene.commands[0] else {
            panic!("landmarks")
        };
        layout.candidates[0].labels = vec![crate::landmark::LandmarkLabel {
            text: "A".into(),
            word_ends: vec![1],
            grapheme_ends: vec![1],
        }];
        let Command::Text { text } = &mut scene.commands[1] else {
            panic!("city")
        };
        text.locality = locality;
        text.x = Some(60.0);
        text.y = Some(20.0);
        replies.push(renderer._test_render(scene, 0.0, 0.0).unwrap());
    }
    assert_eq!(replies[0].image_base64, replies[1].image_base64);
    assert_eq!(
        replies[1].metrics.as_ref().unwrap().accepted_label_ids,
        ["city"]
    );
}

#[test]
fn locality_names_preserve_the_primary_when_context_blocks_other_positions() {
    let mut renderer = _renderer();
    let mut replies = Vec::new();
    for locality in [false, true] {
        let mut scene = _locality_reference_scene([240.0, 240.0]);
        let Command::Text { text } = &mut scene.commands[1] else {
            panic!("city")
        };
        text.locality = locality;
        for (id, bounds) in [
            ("above", [0, 180, 480, 220]),
            ("below", [0, 260, 480, 300]),
            ("left", [100, 235, 180, 245]),
            ("right", [300, 235, 380, 245]),
        ] {
            scene.commands.push(
                serde_json::from_value(serde_json::json!({
                    "type":"text","id":id,"text":"","x":0,"y":0,"size":10,
                    "color":"#000","collide":true,"priority":2400000,"collisionBoxes":[bounds]
                }))
                .unwrap(),
            );
        }
        replies.push(renderer._test_render(scene, 0.0, 0.0).unwrap());
    }
    assert_eq!(replies[0].image_base64, replies[1].image_base64);
    let ids = &replies[1].metrics.as_ref().unwrap().accepted_label_ids;
    assert!(ids.iter().any(|id| id == "city"));
    assert!(!ids.iter().any(|id| id == "landmark:0"));
}

#[test]
fn locality_names_ignore_reference_badges_without_supported_labels() {
    let mut renderer = _renderer();
    let mut replies = Vec::new();
    for locality in [false, true] {
        let mut scene = _locality_reference_scene([240.0, 240.0]);
        let Command::Landmarks { layout } = &mut scene.commands[0] else {
            panic!("landmarks")
        };
        layout.candidates[0].labels = vec![crate::landmark::LandmarkLabel {
            text: "\u{10ffff}".into(),
            word_ends: vec![4],
            grapheme_ends: vec![4],
        }];
        layout.candidates[0].badge.path = "must-not-open.png".into();
        let Command::Text { text } = &mut scene.commands[1] else {
            panic!("city")
        };
        text.locality = locality;
        replies.push(renderer._test_render(scene, 0.0, 0.0).unwrap());
    }
    assert_eq!(replies[0].image_base64, replies[1].image_base64);
    assert_eq!(
        replies[1].metrics.as_ref().unwrap().accepted_label_ids,
        ["city"]
    );
}

#[test]
fn nonlocality_context_keeps_its_position_over_a_central_reference() {
    let mut renderer = _renderer();
    let mut scene = _locality_reference_scene([240.0, 240.0]);
    let Command::Text { text } = &mut scene.commands[1] else {
        panic!("context")
    };
    text.locality = false;
    let actual = renderer._test_render(scene, 0.0, 0.0).unwrap();
    let mut plain = _locality_reference_scene([240.0, 240.0]);
    plain.commands.remove(0);
    let expected = renderer._test_render(plain, 0.0, 0.0).unwrap();
    assert_eq!(actual.image_base64, expected.image_base64);
    assert_eq!(actual.metrics.unwrap().accepted_label_ids, ["city"]);
}

#[test]
fn locality_names_keep_references_with_unknown_source_importance_eligible() {
    let mut renderer = _renderer();
    let expected = renderer
        ._test_render(_locality_reference_scene([240.0, 240.0]), 0.0, 0.0)
        .unwrap();
    let mut scene = _locality_reference_scene([240.0, 240.0]);
    let Command::Landmarks { layout } = &mut scene.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates[0].source_min_zoom = None;
    let actual = renderer._test_render(scene, 0.0, 0.0).unwrap();
    assert_eq!(actual.image_base64, expected.image_base64);
    assert_eq!(
        actual.metrics.unwrap().accepted_label_ids,
        ["city", "landmark:0"]
    );
}

#[test]
fn locality_names_protect_the_strongest_reference_instead_of_counting_weaker_badges() {
    let mut renderer = _renderer();
    let mut replies = Vec::new();
    for count in [2, 25] {
        let mut scene = _reference_scene(480, 480, 100, "Civic Museum");
        let Command::Landmarks { layout } = &mut scene.commands[0] else {
            panic!("landmarks")
        };
        layout.candidates.truncate(count);
        for (index, candidate) in layout.candidates.iter_mut().enumerate() {
            candidate.center = if index == 0 {
                [240.0, 220.0]
            } else {
                [240.0, 280.0]
            };
            candidate.source_min_zoom = Some(if index == 0 { 11.0 } else { 17.0 });
        }
        scene.commands.push(
            _locality_reference_scene([240.0, 240.0])
                .commands
                .pop()
                .unwrap(),
        );
        for (id, bounds) in [
            ("left", [100, 235, 180, 245]),
            ("right", [300, 235, 380, 245]),
        ] {
            scene.commands.push(
                serde_json::from_value(serde_json::json!({
                    "type":"text","id":id,"text":"","x":0,"y":0,"size":10,
                    "color":"#000","collide":true,"priority":2400000,"collisionBoxes":[bounds]
                }))
                .unwrap(),
            );
        }
        replies.push(renderer._test_render(scene, 0.0, 0.0).unwrap());
    }
    assert_eq!(replies[0].image_base64, replies[1].image_base64);
    let ids = &replies[1].metrics.as_ref().unwrap().accepted_label_ids;
    assert!(ids.iter().any(|id| id == "city"));
    assert!(ids.iter().any(|id| id == "landmark:0"));
    assert!(!ids.iter().any(|id| id == "landmark:1"));
}

#[test]
fn locality_reference_selection_preserves_density_and_candidate_order_invariance() {
    let mut renderer = _renderer();
    let mut selected = None;
    for density in [1.0, 2.0, 3.0] {
        let mut images = Vec::new();
        for reverse in [false, true] {
            let mut scene = _reference_scene(480, 480, 150, "Civic Museum");
            scene.pixel_ratio = density;
            let Command::Landmarks { layout } = &mut scene.commands[0] else {
                panic!("landmarks")
            };
            layout.candidates[0].center = [240.0, 240.0];
            layout.candidates[0].source_min_zoom = Some(11.0);
            if reverse {
                layout.candidates.reverse();
            }
            scene.commands.push(
                _locality_reference_scene([240.0, 240.0])
                    .commands
                    .pop()
                    .unwrap(),
            );
            let reply = renderer._test_render(scene, 0.0, 0.0).unwrap();
            let ids = reply.metrics.unwrap().accepted_label_ids;
            assert!(ids.iter().any(|id| id == "city"));
            assert!(ids.iter().any(|id| id == "landmark:0"));
            if let Some(expected) = &selected {
                assert_eq!(&ids, expected);
            } else {
                selected = Some(ids);
            }
            images.push(reply.image_base64);
        }
        assert_eq!(images[0], images[1], "density {density}");
    }
}

#[test]
fn joint_references_keep_prominent_long_names_competitive_with_short_local_detail() {
    let mut renderer = _renderer();
    let mut scene = _reference_scene(480, 480, 100, "Regional Civic Museum");
    let Command::Landmarks { layout } = &mut scene.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(2);
    for candidate in &mut layout.candidates {
        candidate.center = [240.0, 240.0];
    }
    layout.candidates[0].source_min_zoom = Some(11.0);
    layout.candidates[1].source_min_zoom = Some(17.0);
    layout.candidates[1].labels[0] = serde_json::from_value(serde_json::json!({
        "text":"Dia","wordEnds":[3],"graphemeEnds":[1,2,3]
    }))
    .unwrap();
    let metrics = renderer
        ._test_render(scene, 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    assert_eq!(metrics.accepted_label_ids, ["landmark:0"]);
}

#[test]
fn adaptive_references_normalize_sparse_local_importance_using_only_viable_names() {
    let mut renderer = _renderer();
    let mut scene = _reference_scene(480, 480, 100, "Park");
    let Command::Landmarks { layout } = &mut scene.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(3);
    layout.view_zoom = 11.0;
    for candidate in &mut layout.candidates {
        candidate.source_min_zoom = Some(17.0);
    }
    layout.candidates[0].center = [120.0, 120.0];
    layout.candidates[1].center = [360.0, 360.0];
    layout.candidates[2].center = [240.0, 240.0];
    layout.candidates[2].source_min_zoom = Some(11.0);
    layout.candidates[2].labels[0] = serde_json::from_value(serde_json::json!({
        "text":"\u{10ffff}","wordEnds":[4],"graphemeEnds":[4]
    }))
    .unwrap();
    let metrics = renderer
        ._test_render(scene, 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    assert_eq!(metrics.accepted_label_ids, ["landmark:0", "landmark:1"]);
    assert_eq!(metrics.unsupported_labels, 0);
}

#[test]
fn adaptive_references_preserve_context_collisions_without_forcing_a_minimum() {
    let mut renderer = _renderer();
    let mut scene = _reference_scene(240, 240, 100, "Park");
    let Command::Landmarks { layout } = &mut scene.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(1);
    layout.candidates[0].center = [120.0, 120.0];
    layout.candidates[0].source_min_zoom = None;
    let centered = renderer
        ._test_render(scene, 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    assert_eq!(centered.accepted_label_ids, ["landmark:0"]);
    let mut scene = _reference_scene(240, 240, 100, "Park");
    let Command::Landmarks { layout } = &mut scene.commands[0] else {
        panic!("landmarks")
    };
    layout.candidates.truncate(1);
    layout.candidates[0].center = [120.0, 120.0];
    scene.commands.push(Command::Text {
        text: Box::new(
            serde_json::from_value(serde_json::json!({
                "id":"context","text":"Town center","x":120,"y":120,"size":18,"color":"#000",
                "anchor":"center","collide":true,"priority":2300000
            }))
            .unwrap(),
        ),
    });
    let blocked = renderer
        ._test_render(scene, 0.0, 0.0)
        .unwrap()
        .metrics
        .unwrap();
    assert_eq!(blocked.accepted_label_ids, ["context"]);
}

#[test]
fn render_keeps_atomic_landmarks_alternatives_and_visible_images_together() {
    let mut renderer = _renderer();
    let icon_path = _temporary_path("icon.png");
    let mut icon = Pixmap::new(2, 2).unwrap();
    icon.fill(tiny_skia::Color::from_rgba8(255, 0, 0, 255));
    icon.save_png(&icon_path).unwrap();
    let request = _scene(serde_json::json!({
        "width":64,"height":64,"background":"#fff","commands":[
            {"type":"fill","paths":[[[0,0],[64,0],[64,64],[0,64]]],"color":"#e0e0e0","clip":[0,0,64,64]},
            {"type":"text","id":"context","text":"Center","x":32,"y":32,"size":10,"color":"#000","collide":true,"priority":10},
            {"type":"text","id":"context","text":"Duplicate","x":32,"y":50,"size":10,"color":"#000","collide":true,"priority":9},
            {"type":"text","id":"collision","text":"Center","x":32,"y":32,"size":10,"color":"#000","collide":true,"priority":8},
            {"type":"text","id":"edge","text":"Edge","x":0,"y":0,"size":10,"color":"#000","edgeMargin":6,"priority":7},
            {"type":"text","id":"pin","text":"","x":8,"y":8,"size":10,"color":"#000","priority":6,"collide":true,"collisionBoxes":[[5,5,11,11]]},
            {"type":"text","id":"secondary-pin","text":"","x":24,"y":8,"size":10,"color":"#000","priority":4},
            {"type":"text","id":"alternative","text":"B","size":6,"color":"#000","priority":2,"edgeMargin":6,"alternatives":[{"x":0,"y":0,"anchor":"left"},{"x":50,"y":50,"anchor":"center"}]},
            {"type":"text","id":"unsupported","text":"\u{10ffff}","x":50,"y":15,"size":8,"color":"#000","priority":1},
            {"type":"image","labelId":"pin","path":icon_path,"x":6,"y":6,"width":4,"height":4},
            {"type":"image","labelId":"pin","path":icon_path,"x":6,"y":6,"width":4,"height":4},
            {"type":"image","labelId":"edge","path":"must-not-open.png","x":14,"y":6,"width":4,"height":4},
            {"type":"image","path":"must-not-open.png","x":1,"y":1,"width":0,"height":4}
        ]
    }));
    let reply = renderer._test_render(request, 0.0, 0.0).unwrap();
    let pixels = _decode_webp(&reply);
    assert_eq!((reply.width, reply.height), (Some(64), Some(64)));
    let badge = &pixels[(8 * 64 + 8) * 4..][..4];
    assert!(badge[0] > 160 && badge[0].saturating_sub(badge[1]) > 100);
    assert_eq!(badge[3], 255);
    let metrics = reply.metrics.unwrap();
    assert_eq!(
        metrics.accepted_label_ids,
        ["context", "pin", "secondary-pin", "alternative"]
    );
    assert_eq!(metrics.skipped_labels, 4);
    assert!(metrics.missing_glyphs > 0);
    assert!(metrics.unsupported_labels > 0);
    assert!(metrics.roi_geometry.is_some());
    assert!(renderer._assets.contains_key(&(icon_path.clone(), false)));
    std::fs::remove_file(icon_path).unwrap();
}

#[test]
fn production_webp_preserves_transparency_and_recovers_after_a_missing_badge_asset() {
    let mut renderer = _renderer();
    let scene = serde_json::json!({"width":16,"height":16,"background":"#00000000","commands":[]});
    let reply = renderer
        ._test_render(_scene(scene.clone()), 0.0, 0.0)
        .unwrap();
    let pixels = _decode_webp(&reply);
    assert!(pixels.chunks_exact(4).all(|pixel| pixel[3] == 0));
    assert!(reply.metrics.unwrap().roi_fallback.is_some());
    let invalid = _scene(
        serde_json::json!({"width":16,"height":16,"background":"#fff","commands":[{"type":"image","path":_temporary_path("missing.png"),"x":0,"y":0,"width":4,"height":4}]}),
    );
    assert!(
        renderer
            ._test_render(invalid, 0.0, 0.0)
            .err()
            .unwrap()
            .contains("cannot decode PNG asset")
    );
    let recovered = renderer._test_render(_scene(scene), 0.0, 0.0).unwrap();
    assert!(recovered.ok);
    assert!(
        _decode_webp(&recovered)
            .chunks_exact(4)
            .all(|pixel| pixel[3] == 0)
    );
}

#[test]
fn production_wire_rejects_output_format_encoding_and_file_destination_controls() {
    for (field, value) in [
        ("format", serde_json::json!("png")),
        ("format", serde_json::json!("webp")),
        ("encode", serde_json::json!(true)),
        ("encode", serde_json::json!(false)),
        (
            "outputPath",
            serde_json::json!("/tmp/forbidden-output.webp"),
        ),
    ] {
        let mut input = serde_json::json!({"id":1,"op":"ready"});
        input[field] = value;
        assert!(
            serde_json::from_value::<Request>(input).is_err(),
            "accepted {field}"
        );
    }
}

#[test]
fn production_wire_rejects_caller_owned_rendering_policy() {
    assert!(
        serde_json::from_value::<Request>(serde_json::json!({"op":"measure","texts":[]})).is_err()
    );
    for field in ["rasterThreads", "quality", "webpMethod"] {
        let mut input = serde_json::json!({"op":"ready"});
        input[field] = serde_json::json!(true);
        assert!(
            serde_json::from_value::<Request>(input).is_err(),
            "accepted {field}"
        );
    }
}

#[test]
fn production_wire_rejects_arbitrary_drawing_commands() {
    for value in [
        serde_json::json!({"op":"render","scene":{"width":32,"height":32,"background":"#fff","commands":[]}}),
        serde_json::json!({"op":"render","packedScene":{"version":1}}),
        serde_json::json!({"op":"ready","commands":[]}),
    ] {
        assert!(serde_json::from_value::<Request>(value).is_err());
    }
}

#[test]
fn production_wire_requires_map_source_data_and_readiness_draws_without_geographic_sources() {
    for value in [
        serde_json::json!({"op":"render"}),
        serde_json::json!({"op":"render","map":{"commands":[]}}),
        serde_json::json!({"op":"ready","map":{}}),
    ] {
        assert!(serde_json::from_value::<Request>(value).is_err());
    }
    let reply = _renderer()
        .handle(
            Request::Ready {
                id: serde_json::Value::Null,
            },
            0.0,
            0.0,
        )
        .unwrap();
    assert_eq!((reply.width, reply.height), (Some(16), Some(16)));
    assert_eq!(_decode_webp(&reply).len(), 16 * 16 * 4);
    let metrics = reply.metrics.unwrap();
    assert_eq!(metrics.missing_glyphs, 0);
    assert_eq!(metrics.unsupported_labels, 0);
    assert_eq!(metrics.accepted_labels, 1);
}

#[test]
fn close_priority_ordinals_preserve_context_and_landmark_order() {
    let fonts = std::env::var_os("MAPSHOT_FONT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist/native/assets/fonts")
        });
    let mut renderer = Renderer::new(&fonts).expect("prepared Mapshot fonts");
    let request = _scene(
        serde_json::json!({ "width": 80, "height": 80, "background": "#fff", "commands": [
                { "type": "text", "id": "higher", "text": "Center", "x": 40, "y": 40, "size": 12, "color": "#000", "collide": true, "priority": 2300000.70 },
                { "type": "text", "id": "lower", "text": "Center", "x": 40, "y": 40, "size": 12, "color": "#000", "collide": true, "priority": 2300000.65 }
            ]
        }),
    );
    let reply = renderer._test_render(request, 0.0, 0.0).unwrap();
    assert_eq!(reply.metrics.unwrap().accepted_label_ids, vec!["higher"]);
}

#[test]
fn polygon_holes_remain_unpainted_even_with_same_winding() {
    let mut image = Pixmap::new(32, 32).unwrap();
    image.fill(tiny_skia::Color::WHITE);
    let paths = vec![
        Arc::from([[2.0, 2.0], [30.0, 2.0], [30.0, 30.0], [2.0, 30.0]]),
        Arc::from([[10.0, 10.0], [22.0, 10.0], [22.0, 22.0], [10.0, 22.0]]),
    ];
    let command = Command::Fill {
        paths: paths,
        color: "#ff0000".into(),
        opacity: 1.0,
        clip: None,
    };
    _draw_geometry(&command, &mut image, Transform::identity(), None).unwrap();
    assert_eq!(image.pixel(5, 5).unwrap().green(), 0);
    assert_eq!(image.pixel(16, 16).unwrap().green(), 255);
}

#[test]
fn fractional_density_keeps_the_requested_physical_dimensions() {
    let scene: Scene = serde_json::from_str(
        r##"{"width":350,"height":768,"pixelRatio":1.5,"background":"#fff","commands":[]}"##,
    )
    .unwrap();
    assert_eq!(_dimensions(&scene).unwrap(), (525, 1152));
}

#[test]
fn accepts_webp_dimensions_above_the_former_pixel_budget_without_allocating() {
    let scene: Scene = serde_json::from_str(
        r##"{"width":480,"height":1280,"pixelRatio":8,"background":"#fff","commands":[]}"##,
    )
    .unwrap();
    assert_eq!(_dimensions(&scene).unwrap(), (3840, 10240));
}

#[test]
fn collision_grid_checks_overlaps_across_cell_boundaries() {
    let mut grid = CollisionGrid::_new();
    grid._insert([30.0, 30.0, 40.0, 40.0]);
    assert!(grid._intersects([39.0, 39.0, 50.0, 50.0]));
    assert!(!grid._intersects([40.0, 40.0, 50.0, 50.0]));
}

#[test]
fn clip_mask_blocks_tile_overscan_at_density_two() {
    let mut renderer = _renderer();
    let scene = _scene(serde_json::json!({
        "width":32,"height":32,"pixelRatio":2,"background":"#ffffff","commands":[
            {"type":"fill","paths":[[[0,0],[32,0],[32,32],[0,32]]],"color":"#ff0000","clip":[5,5,15,15]},
            {"type":"stroke","paths":[],"color":"#000000","width":0}
        ]
    }));
    let reply = renderer._test_render(scene, 0.0, 0.0).unwrap();
    let pixels = _decode_webp(&reply);
    let metrics = reply.metrics.unwrap();
    assert!(metrics.roi_fallback.is_some());
    assert_eq!(metrics.clip_masks, 1);
    let inside = &pixels[(20 * 64 + 20) * 4..][..4];
    let outside = &pixels[(20 * 64 + 40) * 4..][..4];
    assert!(inside[0] > 220 && inside[1] < 30 && inside[2] < 30);
    assert!(outside[0..3].iter().all(|channel| *channel > 240));
}

#[test]
fn renders_every_clip_after_the_mask_cache_budget_is_exceeded() {
    let mut renderer = _renderer();
    let commands = (0..65)
        .map(|index| Command::Fill {
            paths: vec![Arc::from([
                [64.0, 0.0],
                [80.0, 0.0],
                [80.0, 16.0],
                [64.0, 16.0],
            ])],
            color: "#00ff00".into(),
            opacity: 1.0,
            clip: Some([index as f32, 0.0, 1024.0, 1024.0]),
        })
        .collect();
    let scene = Scene {
        width: 1024.0,
        height: 1024.0,
        pixel_ratio: 1.0,
        background: "#ffffff".into(),
        commands: commands,
    };
    let reply = renderer._test_render(scene, 0.0, 0.0).unwrap();
    let pixels = _decode_webp(&reply);
    let painted = &pixels[(8 * 1024 + 72) * 4..][..4];
    assert!(painted[0] < 30 && painted[1] > 220 && painted[2] < 30);
}

#[test]
fn invalid_dimensions_reject_zero_nonfinite_subpixel_and_non_webp_outputs() {
    for (width, height, pixel_ratio) in [
        (0.0, 32.0, 1.0),
        (32.0, 0.0, 1.0),
        (32.0, 32.0, 0.0),
        (f64::NAN, 32.0, 1.0),
        (32.0, f64::NAN, 1.0),
        (0.1, 32.0, 1.0),
        (32.0, 0.1, 1.0),
        (16384.0, 32.0, 1.0),
        (32.0, 16384.0, 1.0),
    ] {
        let mut scene: Scene = serde_json::from_value(
            serde_json::json!({"width":32,"height":32,"background":"#fff","commands":[]}),
        )
        .unwrap();
        scene.width = width;
        scene.height = height;
        scene.pixel_ratio = pixel_ratio;
        assert!(_dimensions(&scene).is_err());
    }
}

#[test]
fn ordered_fallback_reuses_masks_clips_labels_and_accepts_anonymous_labels() {
    let mut renderer = _renderer();
    let request = _scene(serde_json::json!({
        "width":64,"height":64,"background":"#fff","commands":[
            {"type":"fill","paths":[[[0,0],[64,0],[64,64],[0,64]]],"color":"#eee","clip":[0,0,32,64]},
            {"type":"fill","paths":[[[0,0],[64,0],[64,64],[0,64]]],"color":"#f00","opacity":0.3,"clip":[0,0,32,64]},
            {"type":"stroke","paths":[[[1,1]]],"color":"#000","width":1},
            {"type":"text","text":"A","x":16,"y":32,"size":8,"color":"#000","clip":[0,0,32,64]},
            {"type":"text","text":"Top","x":32,"y":0,"size":8,"color":"#000","edgeMargin":6},
            {"type":"text","text":"Right","x":64,"y":32,"size":8,"color":"#000","edgeMargin":6},
            {"type":"text","text":"Bottom","x":32,"y":64,"size":8,"color":"#000","edgeMargin":6},
            {"type":"fill","paths":[[[3,3],[7,3],[7,7],[3,7]]],"color":"#00f","clip":[0,0,16,16]},
            {"type":"fill","paths":[[[10,10],[14,10],[14,14],[10,14]]],"color":"#00f","clip":[0,0,16,16]},
            {"type":"image","path":"must-not-open.png","x":0,"y":0,"width":4,"height":0}
        ]
    }));
    let reply = renderer._test_render(request, 0.0, 0.0).unwrap();
    let metrics = reply.metrics.unwrap();
    assert_eq!(metrics.clip_masks, 2);
    assert_eq!(metrics.accepted_labels, 1);
    assert_eq!(metrics.skipped_labels, 3);
    assert!(metrics.accepted_label_ids.is_empty());
    assert!(metrics.roi_fallback.is_some());
    let mut grid = CollisionGrid::_new();
    grid._insert([30.0, 30.0, 40.0, 40.0]);
    assert!(!grid._intersects([35.0, 41.0, 39.0, 44.0]));
    assert!(!grid._intersects([35.0, 25.0, 39.0, 29.0]));
    assert!(_path(&[Arc::from([[1.0, 1.0], [2.0, 2.0]])], true).is_none());
}

#[test]
fn png_asset_cache_evicts_older_entries_and_accepts_a_larger_single_asset() {
    let mut renderer = _renderer();
    let first = _temporary_path("first.png");
    let second = _temporary_path("second.png");
    let oversized = _temporary_path("oversized.png");
    let mut image = Pixmap::new(1500, 1500).unwrap();
    image.fill(tiny_skia::Color::WHITE);
    image.save_png(&first).unwrap();
    image.save_png(&second).unwrap();
    drop(image);
    renderer._load_asset(&first, false).unwrap();
    renderer._load_asset(&first, true).unwrap();
    assert_eq!(renderer._asset_bytes, (1500 * 1500 + 1512 * 1512) * 4);
    assert!(renderer._assets[&(first.clone(), true)].shadow.is_some());
    renderer._load_asset(&second, false).unwrap();
    assert_eq!(renderer._asset_bytes, 1500 * 1500 * 4);
    assert!(!renderer._assets.contains_key(&(first.clone(), false)));
    assert!(!renderer._assets.contains_key(&(first.clone(), true)));
    assert!(renderer._assets.contains_key(&(second.clone(), false)));
    let image = Pixmap::new(2049, 2049).unwrap();
    image.save_png(&oversized).unwrap();
    drop(image);
    renderer._load_asset(&oversized, false).unwrap();
    assert_eq!(renderer._assets.len(), 1);
    assert!(renderer._assets.contains_key(&(oversized.clone(), false)));
    assert_eq!(renderer._asset_bytes, 2049 * 2049 * 4);
    for path in [first, second, oversized] {
        std::fs::remove_file(path).unwrap();
    }
}

#[test]
fn native_landmark_batches_skip_unused_shaping_and_repeat_identically() {
    let mut renderer = _renderer();
    let icon_path = _temporary_path("batch-icon.png");
    let mut icon = Pixmap::new(2, 2).unwrap();
    icon.fill(tiny_skia::Color::from_rgba8(0, 128, 0, 255));
    icon.save_png(&icon_path).unwrap();
    let block = serde_json::json!({
        "type":"landmarks", "priority":1000, "viewZoom":13,
        "style":{"badgeRadius":9,"badgeStrokeWidth":1.25,
            "labelGap":3,"edgeMargin":6,"labelFontSize":10,"labelMaxWidth":80,"labelMaxLines":3,
            "labelLineHeight":12,"labelLetterSpacing":-0.2,"labelHaloWidth":2},
        "candidates":[
            {"id":"landmark:accepted","labels":[{"text":"Aa","wordEnds":[2],"graphemeEnds":[1,2]}],"center":[32,32],
                "badge":{"path":icon_path,"logicalSize":26},"textColor":"#008236","rank":0,"sourceMinZoom":null},
            {"id":"landmark:unused","labels":[{"text":"\u{10ffff}","wordEnds":[4],"graphemeEnds":[4]}],"center":[32,55],
                "badge":{"path":"must-not-open.png","logicalSize":26},"textColor":"#008236","rank":1,"sourceMinZoom":null}
        ]
    });
    let scene = serde_json::json!({"width":128,"height":96,"pixelRatio":1,"background":"#fff","commands":[block]});
    let mut prior = None;
    for _ in 0..2 {
        let reply = renderer
            ._test_render(_scene(scene.clone()), 0.0, 0.0)
            .unwrap();
        let metrics = reply.metrics.unwrap();
        assert_eq!(metrics.accepted_label_ids, vec!["landmark:accepted"]);
        assert_eq!(metrics.missing_glyphs, 0);
        assert_eq!(metrics.unsupported_labels, 0);
        assert_eq!(renderer._assets.len(), 1);
        assert_eq!(renderer._asset_bytes, (2 * 2 + 14 * 14) * 4);
        assert!(
            renderer._assets[&(icon_path.clone(), true)]
                .shadow
                .is_some()
        );
        if let Some(ref bytes) = prior {
            assert_eq!(reply.image_base64.as_ref().unwrap(), bytes);
        }
        prior = reply.image_base64;
    }
    std::fs::remove_file(icon_path).unwrap();
}

#[test]
fn unsupported_landmark_names_are_atomic_omissions_and_provider_fallbacks_remain_eligible() {
    let mut renderer = _renderer();
    let icon_path = _temporary_path("fallback-icon.png");
    let mut icon = Pixmap::new(2, 2).unwrap();
    icon.fill(tiny_skia::Color::from_rgba8(0, 128, 0, 255));
    icon.save_png(&icon_path).unwrap();
    let block = serde_json::json!({
        "type":"landmarks", "priority":1000, "viewZoom":13,
        "style":{"badgeRadius":9,"badgeStrokeWidth":1.25,
            "labelGap":3,"edgeMargin":6,"labelFontSize":10,"labelMaxWidth":80,"labelMaxLines":3,
            "labelLineHeight":12,"labelLetterSpacing":-0.2,"labelHaloWidth":2},
        "candidates":[
            {"id":"landmark:unsupported","labels":[{"text":"\u{10ffff}","wordEnds":[4],"graphemeEnds":[4]}],
                "center":[32,32],"badge":{"path":"must-not-open.png","logicalSize":26},"textColor":"#008236","rank":0,"sourceMinZoom":null},
            {"id":"landmark:fallback","labels":[
                {"text":"\u{10ffff}","wordEnds":[4],"graphemeEnds":[4]},
                {"text":"Aa","wordEnds":[2],"graphemeEnds":[1,2]}],
                "center":[32,55],"badge":{"path":icon_path,"logicalSize":26},"textColor":"#008236","rank":1,"sourceMinZoom":null},
            {"id":"landmark:unused","labels":[{"text":"\u{10ffff}","wordEnds":[1],"graphemeEnds":[1]}],
                "center":[32,75],"badge":{"path":"must-not-open.png","logicalSize":26},"textColor":"#008236","rank":2,"sourceMinZoom":null}
        ]
    });
    let request = _scene(serde_json::json!({
        "width":128,"height":96,"pixelRatio":1,"background":"#fff","commands":[block]
    }));
    let reply = renderer._test_render(request, 0.0, 0.0).unwrap();
    let metrics = reply.metrics.unwrap();
    assert_eq!(metrics.accepted_label_ids, vec!["landmark:fallback"]);
    assert_eq!(metrics.missing_glyphs, 0);
    assert_eq!(metrics.unsupported_labels, 0);
    assert_eq!(metrics.skipped_labels, 2);
    std::fs::remove_file(icon_path).unwrap();
}

fn _panel(renderer: &mut Renderer, commands: Vec<serde_json::Value>) -> Reply {
    renderer
        ._test_render(
            _scene(serde_json::json!({
                "width":480,"height":480,"pixelRatio":2,"background":"#ffffff","commands":commands
            })),
            0.0,
            0.0,
        )
        .unwrap()
}

fn _panel_text(id: &str, text: &str, x: f32, y: f32) -> serde_json::Value {
    serde_json::json!({"type":"text","id":id,"text":text,"x":x,"y":y,
        "size":20,"weight":600,"color":"#333333","haloColor":"#ffffff","haloWidth":1,
        "collide":true,"padding":3,"priority":0,"maxWidth":420,"lineHeight":1.2,"letterSpacing":0})
}

#[test]
fn production_raster_pipeline_draws_mixed_scripts_and_tibetan_provider_names_without_missing_glyphs()
 {
    let mut renderer = _renderer();
    for labels in [
        vec![
            ("latin", "Café São Paulo"),
            ("japanese", "東京 骨直令 𠮷"),
            ("arabic", "مرحبا بكم في القاهرة Tokyo"),
            ("hebrew", "בית קפה Tokyo"),
            ("devanagari", "मुंबई क्\u{200d}ष"),
            ("thai", "กรุงเทพมหานคร"),
        ],
        vec![
            ("tibetan-stupa", "མཆོད་རྟེན།"),
            ("tibetan-library", "དཔེ་མཛོད་ཁང་།"),
            ("tibetan-hospital", "索县།利众藏医院"),
        ],
    ] {
        let reply = _panel(
            &mut renderer,
            labels
                .iter()
                .enumerate()
                .map(|(index, (id, text))| _panel_text(id, text, 240.0, 60.0 + index as f32 * 70.0))
                .collect(),
        );
        let pixels = _decode_webp(&reply);
        let metrics = reply.metrics.unwrap();
        assert_eq!(metrics.accepted_label_ids.len(), labels.len());
        assert_eq!(metrics.missing_glyphs, 0);
        assert_eq!(metrics.unsupported_labels, 0);
        for (index, (id, _)) in labels.iter().enumerate() {
            let ink = ((40 + index * 70) * 2..(80 + index * 70) * 2)
                .flat_map(|y| (20..940).map(move |x| (y * 960 + x) * 4))
                .filter(|offset| pixels[*offset] < 120)
                .count();
            assert!(ink > 30, "{}: actual glyph outlines must draw", id);
        }
    }
}

#[test]
fn production_raster_pipeline_preserves_joined_arabic_clusters() {
    let mut renderer = _renderer();
    let texts = ["سلام", "س", "ل", "ا", "م"];
    let reply = _panel(
        &mut renderer,
        texts
            .iter()
            .enumerate()
            .map(|(index, text)| {
                _panel_text(&index.to_string(), text, 240.0, 60.0 + index as f32 * 90.0)
            })
            .collect(),
    );
    let pixels = _decode_webp(&reply);
    let widths = (0..texts.len())
        .map(|index| {
            let mut minimum = 960;
            let mut maximum = 0;
            for y in (35 + index * 90) * 2..(85 + index * 90) * 2 {
                for x in 20..940 {
                    if pixels[(y * 960 + x) * 4] < 120 {
                        minimum = minimum.min(x);
                        maximum = maximum.max(x);
                    }
                }
            }
            assert!(maximum >= minimum, "actual Arabic glyphs must draw");
            maximum - minimum + 1
        })
        .collect::<Vec<_>>();
    assert!((widths[0] as f64) < widths[1..].iter().sum::<usize>() as f64 * 0.9);
}

#[test]
fn production_raster_pipeline_renders_han_kana_and_hangul_without_geographic_hints() {
    let mut renderer = _renderer();
    for text in ["東京 骨直令 𠮷", "骨あ", "骨ア", "骨한", "香港", "臺北"] {
        let reply = _panel(&mut renderer, vec![_panel_text("cjk", text, 240.0, 240.0)]);
        let metrics = reply.metrics.as_ref().unwrap();
        assert_eq!(metrics.accepted_label_ids, vec!["cjk"], "{text}");
        assert_eq!(metrics.missing_glyphs, 0, "{text}");
        assert_eq!(metrics.unsupported_labels, 0, "{text}");
        assert!(
            _decode_webp(&reply)
                .chunks_exact(4)
                .any(|pixel| pixel[0] < 120),
            "{text}"
        );
    }
}

#[test]
fn production_raster_pipeline_keeps_curved_glyph_ink_at_the_explicit_road_anchor() {
    let mut renderer = _renderer();
    let mut command = _panel_text("curved-road", "Rua Curva", 130.0, 190.0);
    command["color"] = serde_json::json!("#e00000");
    command["path"] = serde_json::json!([
        [20, 250],
        [75, 220],
        [130, 190],
        [185, 160],
        [240, 150],
        [295, 160],
        [350, 190],
        [405, 220],
        [460, 250]
    ]);
    let reply = _panel(&mut renderer, vec![command]);
    assert_eq!(
        reply.metrics.as_ref().unwrap().accepted_label_ids,
        vec!["curved-road"]
    );
    let pixels = _decode_webp(&reply);
    let mut ink = 0;
    let mut sum_x = 0;
    for y in 0..960 {
        for x in 0..960 {
            let i = (y * 960 + x) * 4;
            if pixels[i] > 130 && pixels[i + 1] < 100 && pixels[i + 2] < 100 {
                ink += 1;
                sum_x += x;
            }
        }
    }
    assert!(ink > 30);
    assert!((sum_x as f64 / ink as f64 / 2.0 - 130.0).abs() < 25.0);
}

#[test]
fn unsupported_visible_unicode_remains_an_explicit_native_diagnostic() {
    let mut renderer = _renderer();
    let reply = _panel(
        &mut renderer,
        vec![_panel_text("unsupported", "\u{10ffff}", 240.0, 240.0)],
    );
    let metrics = reply.metrics.unwrap();
    assert!(metrics.missing_glyphs > 0);
    assert!(metrics.unsupported_labels > 0);
    assert!(metrics.accepted_label_ids.is_empty());
}

#[test]
fn collision_fallback_rejustifies_multiline_text_for_the_selected_side() {
    let mut renderer = _renderer();
    let direct = serde_json::json!({
        "width":320,"height":160,"background":"#fff","commands":[
            {"type":"text","id":"obstacle","text":"Blocked","x":170,"y":80,"size":18,
                "color":"#000","anchor":"left","collide":true,"priority":10},
            {"type":"text","id":"label","text":"Museum of Art\nArt","x":134,"y":80,"size":18,
                "color":"#7F22FE","haloColor":"#fff","haloWidth":1.1,
                "anchor":"right","justify":"right","collide":true,"priority":1}
        ]
    });
    let expected = renderer
        ._test_render(_scene(direct.clone()), 0.0, 0.0)
        .unwrap();
    let mut alternatives = direct;
    alternatives["commands"][1]["justify"] = serde_json::json!("auto");
    alternatives["commands"][1]["alternatives"] = serde_json::json!([
        {"x":166,"y":80,"anchor":"left"}, {"x":134,"y":80,"anchor":"right"}
    ]);
    let actual = renderer
        ._test_render(_scene(alternatives), 0.0, 0.0)
        .unwrap();
    assert_eq!(
        actual.metrics.as_ref().unwrap().accepted_label_ids,
        ["obstacle", "label"]
    );
    assert_eq!(actual.image_base64, expected.image_base64);
}
