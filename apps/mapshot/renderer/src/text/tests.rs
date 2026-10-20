use super::*;

fn _engine() -> TextEngine {
    let root = std::env::var_os("MAPSHOT_FONT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../dist/native/assets/fonts")
        });
    TextEngine::new(&root).expect("prepare the Mapshot font assets before native tests")
}

fn _command(text: &str) -> TextCommand {
    serde_json::from_value(
        serde_json::json!({"text":text,"size":18,"color":"#173b2b","x":160,"y":80}),
    )
    .unwrap()
}

fn _font(engine: &mut TextEngine, text: &str, weight: u16) -> usize {
    let mut command = _command(text);
    command.weight = weight;
    engine.layout(&command).unwrap()._glyphs[0]._font
}

#[test]
fn selects_primary_faces_from_numeric_weights_and_defaults_to_regular() {
    let mut engine = _engine();
    for weight in [400, 600, 700] {
        let command = serde_json::from_value(serde_json::json!({
            "text": "Museum",
            "size": 18,
            "weight": weight,
            "color": "#173b2b"
        }))
        .unwrap();
        let font = engine.layout(&command).unwrap()._glyphs[0]._font;
        assert_eq!(engine._fonts[font]._weight, weight);
    }
    let font = engine.layout(&_command("Museum")).unwrap()._glyphs[0]._font;
    assert_eq!(engine._fonts[font]._weight, 400);
}

#[test]
fn shapes_original_multilingual_names_without_missing_glyphs() {
    let mut engine = _engine();
    for text in [
        "São João",
        "東京",
        "北京",
        "吉野𠮷",
        "서울",
        "القاهرة",
        "ירושלים",
        "मुंबई",
        "क्ष",
        "กรุงเทพ",
        "Cafe\u{301}",
    ] {
        let command = _command(text);
        let measured = engine.measure(&command).unwrap();
        assert_eq!(measured.missing_glyphs, 0, "{text}");
        assert!(measured.width > 0.0, "{text}");
        let layout = engine.layout(&command).unwrap();
        assert!(
            layout.fully_supported && layout.skipped_reason.is_none(),
            "{text}"
        );
        assert!(layout.bounds[2] > layout.bounds[0], "{text}");
    }
}

#[test]
fn shapes_tibetan_provider_names_with_the_verified_regional_font_and_real_outlines() {
    let mut engine = _engine();
    for text in ["མཆོད་རྟེན།", "དཔེ་མཛོད་ཁང་།", "索县།利众藏医院"]
    {
        let mut command = _command(text);
        command.weight = 600;
        let measured = engine.measure(&command).unwrap();
        assert_eq!(measured.missing_glyphs, 0, "{text}");
        assert!(measured.width > 0.0, "{text}");
        let layout = engine.layout(&command).unwrap();
        assert!(
            layout.fully_supported && layout.skipped_reason.is_none(),
            "{text}"
        );
        let mut image = Pixmap::new(320, 160).unwrap();
        engine
            .draw(&mut image, &command, &layout, 1.0, None)
            .unwrap();
        assert!(
            image.data().chunks_exact(4).any(|pixel| pixel[3] != 0),
            "{text}"
        );
        let index = _font(&mut engine, "མ", 600);
        assert_eq!(engine._fonts[index]._family, "NotoSerifTibetan");
        assert_eq!(engine._fonts[index]._weight, 600);
    }
}

#[test]
fn support_admission_reuses_real_shapes_and_matches_native_outline_layout() {
    let mut engine = _engine();
    for text in ["Museum", "東京", "مرحبا", "क्ष", "a\u{200d}b", "\u{10ffff}"] {
        let command = _command(text);
        assert_eq!(
            engine.supports(&command).unwrap(),
            engine.layout(&command).unwrap().fully_supported,
            "{text}"
        );
    }
    let command = _command("Museum");
    let before = engine.cache_stats().shape_misses;
    assert!(engine.supports(&command).unwrap());
    assert_eq!(engine.cache_stats().shape_misses, before);
}

#[test]
fn shapes_combining_marks_and_indic_conjuncts_as_clusters() {
    let mut engine = _engine();
    let a = engine.measure(&_command("Café")).unwrap();
    let b = engine.measure(&_command("Cafe\u{301}")).unwrap();
    assert!((a.width - b.width).abs() < 0.01);
    let conjunct = engine.layout(&_command("क्ष")).unwrap();
    assert!(conjunct.glyph_count < "क्ष".chars().count());
}

#[test]
fn orders_hebrew_glyphs_visually_and_keeps_inter_primary() {
    let mut engine = _engine();
    let command = _command("אבג");
    let line = engine._shape(&command.text, &command).unwrap();
    let data = engine._body(line._glyphs[0]._font).unwrap();
    let face = FontRef::from_index(
        data.as_slice(),
        engine._fonts[line._glyphs[0]._font]._face_index,
    )
    .unwrap();
    assert_eq!(
        line._glyphs[0]._id,
        face.charmap().map('ג').unwrap().to_u32() as u16
    );
    assert_eq!(
        line._glyphs[2]._id,
        face.charmap().map('א').unwrap().to_u32() as u16
    );
    assert_eq!(_font(&mut engine, ".", 400), 0);
    let jp = _font(&mut engine, "骨かな", 400);
    let sc = _font(&mut engine, "骨", 400);
    assert_eq!(engine._fonts[jp]._family, "NotoSansCJKjp");
    assert_eq!(engine._fonts[sc]._family, "NotoSansCJKsc");
}

#[test]
fn ignores_maximum_width_for_full_road_names_on_paths() {
    let mut engine = _engine();
    let mut command = _command("Avenida Presidente Juscelino Kubitschek");
    command.path = Some(vec![[0.0, 80.0], [700.0, 80.0]]);
    command.max_width = Some(20.0);
    command.x = Some(350.0);
    let layout = engine.layout(&command).unwrap();
    assert!(layout.skipped_reason.is_none());
    assert!(layout.bounds[2] - layout.bounds[0] > 20.0);
}

#[test]
fn explicitly_skips_missing_glyphs_and_sharp_or_short_paths() {
    let mut engine = _engine();
    let missing = engine.layout(&_command("\u{10ffff}")).unwrap();
    assert_eq!(missing.skipped_reason.as_deref(), Some("unsupported-glyph"));
    assert!(!missing.fully_supported);
    let mut command = _command("Mapshot");
    command.path = Some(vec![[0.0, 0.0], [5.0, 0.0]]);
    assert_eq!(
        engine.layout(&command).unwrap().skipped_reason.as_deref(),
        Some("path-too-short")
    );
    command.path = Some(vec![[0.0, 0.0], [100.0, 0.0], [100.0, 100.0]]);
    command.x = None;
    command.y = None;
    command.max_angle = Some(0.0);
    assert_eq!(
        engine.layout(&command).unwrap().skipped_reason.as_deref(),
        Some("path-too-sharp")
    );
}

#[test]
fn reuses_shaped_runs_and_keeps_outline_inventory_bounded() {
    let mut engine = _engine();
    let command = _command("Avenida São João");
    engine.layout(&command).unwrap();
    engine.layout(&command).unwrap();
    assert_eq!(engine.cache_stats().shape_hits, 1);
    assert_eq!(engine.cache_stats().outline_hits, 0);
    let layout = engine.layout(&command).unwrap();
    let mut pixmap = Pixmap::new(320, 160).unwrap();
    engine
        .draw(&mut pixmap, &command, &layout, 1.0, None)
        .unwrap();
    engine
        .draw(&mut pixmap, &command, &layout, 1.0, None)
        .unwrap();
    assert!(engine.cache_stats().outline_hits > 0);
    for batch in 0..3_u32 {
        let text: String = (0..3000)
            .filter_map(|offset| char::from_u32(0x4e00 + batch * 3000 + offset))
            .collect();
        let command = _command(&text);
        let layout = engine.layout(&command).unwrap();
        engine
            .draw(&mut pixmap, &command, &layout, 1.0, None)
            .unwrap();
    }
    let metrics = engine.cache_stats();
    assert!(metrics.outlines <= _OUTLINE_ENTRIES);
    assert!(metrics.outline_bytes <= 16 * 1024 * 1024);
    assert!(metrics.font_bytes <= 64 * 1024 * 1024);
}

#[test]
fn keeps_empty_badge_labels_at_their_given_anchor() {
    let mut engine = _engine();
    let command = _command("");
    let layout = engine.layout(&command).unwrap();
    assert_eq!(layout.bounds, [160.0, 80.0, 160.0, 80.0]);
    assert_eq!(layout.glyph_count, 0);
    assert!(layout.skipped_reason.is_none());
}

#[test]
fn distinguishes_explicit_zero_path_anchor_from_omitted_anchor() {
    let mut engine = _engine();
    let mut command = _command("Map");
    command.path = Some(vec![[-50.0, 0.0], [250.0, 0.0]]);
    command.x = Some(0.0);
    command.y = Some(0.0);
    let exact = engine.layout(&command).unwrap();
    command.x = None;
    command.y = None;
    let midpoint = engine.layout(&command).unwrap();
    assert!(exact.skipped_reason.is_none() && midpoint.skipped_reason.is_none());
    assert!((midpoint.bounds[0] - exact.bounds[0] - 100.0).abs() < 0.01);
}

#[test]
fn centers_wrapped_lines_independently_of_the_block_anchor() {
    let mut engine = _engine();
    let mut command = _command("MMMM\nI");
    command.anchor = "left".into();
    let centered = engine.layout(&command).unwrap();
    command.justify = TextJustify::Left;
    let left = engine.layout(&command).unwrap();
    let long = engine.measure(&_command("MMMM")).unwrap().width;
    let short = engine.measure(&_command("I")).unwrap().width;
    assert!(
        (centered._glyphs[4]._transform.tx - left._glyphs[4]._transform.tx - (long - short) / 2.0)
            .abs()
            < 0.01
    );
    assert_eq!(
        centered._glyphs[0]._transform.tx,
        left._glyphs[0]._transform.tx
    );
}

#[test]
fn rasterizes_cjk_landmark_text_at_every_qualified_weight_without_geographic_hints() {
    let mut engine = _engine();
    for weight in [400, 600, 700] {
        for text in ["新宿中央公園", "骨あ", "骨ア", "骨한", "香港", "臺北"] {
            let mut command = _command(text);
            command.weight = weight;
            let layout = engine.layout(&command).unwrap();
            assert_eq!(layout.missing_glyphs, 0, "{weight} {text}");
            assert!(layout.skipped_reason.is_none(), "{weight} {text}");
            assert!(
                !layout._glyphs.is_empty(),
                "{weight} {text} must have drawable glyph bounds"
            );
            let mut pixmap = Pixmap::new(320, 160).unwrap();
            engine
                .draw(&mut pixmap, &command, &layout, 1.0, None)
                .unwrap();
            assert!(
                pixmap.data().chunks_exact(4).any(|pixel| pixel[3] > 0),
                "{weight} {text} must produce ink"
            );
        }
    }
}

#[test]
fn preserves_rtl_paragraph_bidi_order_when_wrapped_line_starts_with_latin() {
    let mut engine = _engine();
    let mut command = _command("א WWWW def אבג");
    command.max_width = Some(engine.measure(&_command("WWWW")).unwrap().width + 0.1);
    let lines = engine._lines(&command).unwrap();
    assert_eq!(lines.len(), 3);
    let last = lines.last().unwrap();
    let first = &last._glyphs[0];
    let data = engine._body(first._font).unwrap();
    let face =
        FontRef::from_index(data.as_slice(), engine._fonts[first._font]._face_index).unwrap();
    assert_eq!(first._id, face.charmap().map('ג').unwrap().to_u32() as u16);
}

#[test]
fn rasterizes_joiner_conjuncts_and_variation_selectors_without_false_missing_outlines() {
    let mut engine = _engine();
    for text in [
        "क्\u{200d}ष",
        "می\u{200c}روم",
        "A\u{fe0f}",
        "A\u{fe0e}",
        "A \u{200b} B",
        "A\u{2060}B",
    ] {
        let command = _command(text);
        let layout = engine.layout(&command).unwrap();
        assert_eq!(layout.missing_glyphs, 0, "{text}");
        assert!(
            layout.fully_supported && layout.skipped_reason.is_none(),
            "{text}"
        );
        let mut pixmap = Pixmap::new(320, 160).unwrap();
        engine
            .draw(&mut pixmap, &command, &layout, 1.0, None)
            .unwrap();
        assert!(
            pixmap.data().chunks_exact(4).any(|pixel| pixel[3] > 0),
            "{text} must produce ink"
        );
    }
    let with_joiner = engine.layout(&_command("क्\u{200d}ष")).unwrap();
    let conjunct = engine.layout(&_command("क्ष")).unwrap();
    assert!(
        with_joiner.glyph_count > conjunct.glyph_count,
        "ZWJ must still affect conjunct shaping before its output is removed"
    );
}

#[test]
fn keeps_collection_faces_distinct_while_sharing_their_font_body() {
    let mut engine = _engine();
    let regular = _font(&mut engine, "骨かな", 400);
    let semibold = _font(&mut engine, "骨かな", 600);
    assert_eq!(
        engine._fonts[regular]._body_index,
        engine._fonts[semibold]._body_index
    );
    assert_ne!(
        engine._fonts[regular]._face_index,
        engine._fonts[semibold]._face_index
    );
    let data = engine._body(regular).unwrap();
    let regular_face = FontRef::from_index(&data, engine._fonts[regular]._face_index).unwrap();
    let semibold_face = FontRef::from_index(&data, engine._fonts[semibold]._face_index).unwrap();
    let regular_id = regular_face.charmap().map('骨').unwrap().to_u32() as u16;
    let semibold_id = semibold_face.charmap().map('骨').unwrap().to_u32() as u16;
    let regular_command = _command("骨かな");
    let mut semibold_command = _command("骨かな");
    semibold_command.weight = 600;
    let regular_layout = engine.layout(&regular_command).unwrap();
    let semibold_layout = engine.layout(&semibold_command).unwrap();
    let mut pixmap = Pixmap::new(320, 160).unwrap();
    engine
        .draw(&mut pixmap, &regular_command, &regular_layout, 1.0, None)
        .unwrap();
    engine
        .draw(&mut pixmap, &semibold_command, &semibold_layout, 1.0, None)
        .unwrap();
    let regular_key = (
        engine._fonts[regular]._body_index,
        engine._fonts[regular]._face_index,
        regular_id,
    );
    let semibold_key = (
        engine._fonts[semibold]._body_index,
        engine._fonts[semibold]._face_index,
        semibold_id,
    );
    let regular_path = engine._outlines[&regular_key]._path.as_ref().unwrap();
    let semibold_path = engine._outlines[&semibold_key]._path.as_ref().unwrap();
    assert_ne!(regular_path.points(), semibold_path.points());
    engine._glyph_box(regular, regular_id).unwrap();
    engine._glyph_box(semibold, semibold_id).unwrap();
    assert_eq!(engine._bodies.len(), 1);
    assert!(engine._outlines.contains_key(&regular_key));
    assert!(engine._outlines.contains_key(&semibold_key));
    assert!(engine._boxes.contains_key(&regular_key));
    assert!(engine._boxes.contains_key(&semibold_key));
}

fn _temporary_fonts() -> PathBuf {
    let source = _engine()._fonts[0]._path.parent().unwrap().to_path_buf();
    let root = std::env::temp_dir().join(format!(
        "mapshot-text-fonts-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    for name in [
        "fallback-font-set.json",
        "inter-regular.ttf",
        "inter-semibold.ttf",
        "inter-bold.ttf",
    ] {
        fs::copy(source.join(name), root.join(name)).unwrap();
    }
    root
}

#[test]
fn rejects_nonfinite_and_nonpositive_text_parameters() {
    let mut engine = _engine();
    for size in [f32::NAN, f32::INFINITY, 0.0, -1.0] {
        let mut command = _command("A");
        command.size = size;
        assert_eq!(engine.measure(&command).unwrap_err(), "invalid text size");
    }
    for field in ["x", "y", "angle", "spacing", "padding", "halo", "opacity"] {
        let mut command = _command("A");
        match field {
            "x" => command.x = Some(f32::NAN),
            "y" => command.y = Some(f32::INFINITY),
            "angle" => command.angle = f32::NAN,
            "spacing" => command.letter_spacing = f32::NEG_INFINITY,
            "padding" => command.padding = f32::NAN,
            "halo" => command.halo_width = f32::INFINITY,
            "opacity" => command.opacity = f32::NAN,
            _ => unreachable!(),
        }
        assert_eq!(
            engine.measure(&command).unwrap_err(),
            "non-finite text parameter"
        );
    }
}

#[test]
fn shapes_text_above_the_former_font_size_cap() {
    let mut engine = _engine();
    let mut command = _command("A");
    command.size = 513.0;
    assert!(engine.measure(&command).unwrap().width > 0.0);
}

#[test]
fn shapes_text_above_the_former_label_length_cap() {
    let mut engine = _engine();
    let command = _command(&"A".repeat(16385));
    assert_eq!(engine.layout(&command).unwrap().glyph_count, 16385);
}

#[test]
fn rejects_invalid_optional_layout_parameters_and_accepts_boundary_values() {
    let mut engine = _engine();
    for value in [f32::NAN, 0.0, -1.0] {
        let mut command = _command("A");
        command.max_width = Some(value);
        assert_eq!(
            engine.measure(&command).unwrap_err(),
            "invalid text layout parameter"
        );
        command = _command("A");
        command.line_height = Some(value);
        assert_eq!(
            engine.measure(&command).unwrap_err(),
            "invalid text layout parameter"
        );
    }
    for value in [f32::NAN, -1.0] {
        let mut command = _command("A");
        command.max_angle = Some(value);
        assert_eq!(
            engine.measure(&command).unwrap_err(),
            "invalid text layout parameter"
        );
    }
    let mut command = _command("A");
    command.path = Some(vec![[0.0, 0.0], [f32::NAN, 100.0]]);
    assert_eq!(
        engine.measure(&command).unwrap_err(),
        "invalid text layout parameter"
    );
    command.path = Some(vec![[0.0, 0.0], [100.0, f32::INFINITY]]);
    assert_eq!(
        engine.measure(&command).unwrap_err(),
        "invalid text layout parameter"
    );
    command = _command("A");
    command.max_width = Some(1000.0);
    command.line_height = Some(24.0);
    command.max_angle = Some(0.0);
    command.text = "A\nA".into();
    let spaced = engine.layout(&command).unwrap().bounds;
    command.line_height = Some(12.0);
    let compact = engine.layout(&command).unwrap().bounds;
    assert!((spaced[3] - spaced[1] - compact[3] + compact[1] - 12.0).abs() < 0.001);
}

#[test]
fn handles_missing_malformed_deleted_and_corrupted_local_font_assets() {
    let root = _temporary_fonts();
    let missing = root.join("absent");
    assert!(
        TextEngine::new(&missing)
            .err()
            .unwrap()
            .contains("font manifest unavailable")
    );
    let manifest = fs::read(root.join("fallback-font-set.json")).unwrap();
    fs::write(root.join("fallback-font-set.json"), b"{invalid").unwrap();
    assert!(
        TextEngine::new(&root)
            .err()
            .unwrap()
            .contains("invalid font manifest")
    );
    fs::write(root.join("fallback-font-set.json"), manifest).unwrap();
    let mut engine = TextEngine::new(&root).unwrap();
    assert_eq!(engine.measure(&_command("東京")).unwrap().missing_glyphs, 2);
    let mut unloaded = TextEngine::new(&root).unwrap();
    fs::remove_file(root.join("inter-regular.ttf")).unwrap();
    assert!(
        TextEngine::new(&root)
            .err()
            .unwrap()
            .contains("missing primary font")
    );
    assert!(
        unloaded
            .measure(&_command("A"))
            .unwrap_err()
            .contains("font unavailable")
    );
    fs::write(root.join("inter-regular.ttf"), b"not a font").unwrap();
    let mut engine = TextEngine::new(&root).unwrap();
    assert_eq!(
        engine.measure(&_command("A")).unwrap_err(),
        "invalid font face"
    );
    fs::OpenOptions::new()
        .write(true)
        .open(root.join("inter-regular.ttf"))
        .unwrap()
        .set_len(64 * 1024 * 1024 + 1)
        .unwrap();
    let mut engine = TextEngine::new(&root).unwrap();
    assert_eq!(
        engine.measure(&_command("A")).unwrap_err(),
        "invalid font face"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn accepts_valid_fonts_larger_than_the_body_cache_budget() {
    let root = _temporary_fonts();
    fs::OpenOptions::new()
        .write(true)
        .open(root.join("inter-regular.ttf"))
        .unwrap()
        .set_len(64 * 1024 * 1024 + 1)
        .unwrap();
    let mut engine = TextEngine::new(&root).unwrap();
    assert!(engine.measure(&_command("A")).unwrap().width > 0.0);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn evicts_least_recently_used_valid_font_bodies_under_real_memory_pressure() {
    let root = _temporary_fonts();
    for role in ["regular", "semibold", "bold"] {
        // Padding does not change a TTF's tables or glyphs; it exercises the body budget.
        fs::OpenOptions::new()
            .write(true)
            .open(root.join(format!("inter-{role}.ttf")))
            .unwrap()
            .set_len(24 * 1024 * 1024)
            .unwrap();
    }
    let mut engine = TextEngine::new(&root).unwrap();
    let baseline = engine.measure(&_command("A")).unwrap().width;
    let mut command = _command("A");
    command.weight = 600;
    engine.measure(&command).unwrap();
    let evicted_body = Arc::downgrade(&engine._body(1).unwrap());
    engine.measure(&_command("B")).unwrap();
    command.weight = 700;
    engine.measure(&command).unwrap();
    assert!(engine._bodies.contains_key(&0));
    assert!(!engine._bodies.contains_key(&1));
    assert!(
        evicted_body.upgrade().is_none(),
        "parsed shaping fonts must release evicted font bytes"
    );
    assert!(engine._bodies.contains_key(&2));
    assert!(engine.cache_stats().font_bytes <= 64 * 1024 * 1024);
    let mut command = _command("C");
    command.weight = 600;
    engine.measure(&command).unwrap();
    assert!(engine._bodies.contains_key(&1));
    assert_eq!(engine.measure(&_command("A")).unwrap().width, baseline);
    let mut command = _command("A");
    command.size = 36.0;
    assert_eq!(engine.measure(&command).unwrap().width, baseline * 2.0);
    assert!(engine._bodies.contains_key(&0));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_multiline_short_and_endpoint_clipped_path_labels() {
    let mut engine = _engine();
    let mut command = _command("Map\nRoad");
    command.path = Some(vec![[0.0, 80.0], [300.0, 80.0]]);
    assert_eq!(
        engine.layout(&command).unwrap().skipped_reason.as_deref(),
        Some("multiline-path")
    );
    command.text = "Map".into();
    for path in [vec![], vec![[0.0, 80.0]]] {
        command.path = Some(path);
        assert_eq!(
            engine.layout(&command).unwrap().skipped_reason.as_deref(),
            Some("path-too-short")
        );
    }
    command.path = Some(vec![[0.0, 80.0], [300.0, 80.0], [300.0, 80.0]]);
    command.x = Some(0.0);
    assert_eq!(
        engine.layout(&command).unwrap().skipped_reason.as_deref(),
        Some("path-too-short")
    );
    command.x = Some(300.0);
    assert_eq!(
        engine.layout(&command).unwrap().skipped_reason.as_deref(),
        Some("path-too-short")
    );
    command.x = Some(150.0);
    let forward = engine.layout(&command).unwrap();
    command.path.as_mut().unwrap().reverse();
    let reverse = engine.layout(&command).unwrap();
    assert_eq!(forward.bounds, reverse.bounds);
}

#[test]
fn draws_halos_and_opacity_and_does_not_draw_skipped_or_empty_labels() {
    let mut engine = _engine();
    let mut command = _command("Mapshot");
    let layout = engine.layout(&command).unwrap();
    let mut plain = Pixmap::new(320, 160).unwrap();
    engine
        .draw(&mut plain, &command, &layout, 1.0, None)
        .unwrap();
    command.halo_color = Some("white".into());
    command.halo_width = 2.0;
    let mut halo = Pixmap::new(320, 160).unwrap();
    engine
        .draw(&mut halo, &command, &layout, 1.0, None)
        .unwrap();
    let count = |pixmap: &Pixmap| -> usize {
        pixmap
            .data()
            .chunks_exact(4)
            .filter(|pixel| pixel[3] > 0)
            .count()
    };
    assert!(count(&halo) > count(&plain));
    command.halo_width = 0.0;
    let mut zero_halo = Pixmap::new(320, 160).unwrap();
    engine
        .draw(&mut zero_halo, &command, &layout, 1.0, None)
        .unwrap();
    assert_eq!(zero_halo.data(), plain.data());
    command.opacity = 0.0;
    let mut invisible = Pixmap::new(320, 160).unwrap();
    engine
        .draw(&mut invisible, &command, &layout, 1.0, None)
        .unwrap();
    assert_eq!(count(&invisible), 0);
    command.color = "invalid color".into();
    assert_eq!(
        engine
            .draw(&mut invisible, &command, &layout, 1.0, None)
            .unwrap_err(),
        "invalid text color"
    );
    command.color = "black".into();
    command.halo_color = Some("invalid halo".into());
    assert_eq!(
        engine
            .draw(&mut invisible, &command, &layout, 1.0, None)
            .unwrap_err(),
        "invalid text color"
    );
    for text in ["", "\u{200b}\u{2060}", "\u{10ffff}"] {
        let command = _command(text);
        let layout = engine.layout(&command).unwrap();
        let mut pixmap = Pixmap::new(320, 160).unwrap();
        engine
            .draw(&mut pixmap, &command, &layout, 1.0, None)
            .unwrap();
        assert_eq!(count(&pixmap), 0);
    }
}

#[test]
fn selects_japanese_and_korean_faces_from_text_and_one_default_for_han_only_names() {
    let mut engine = _engine();
    for (text, expected) in [
        ("東京", "sc"),
        ("香港", "sc"),
        ("臺北", "sc"),
        ("骨あ", "jp"),
        ("骨ア", "jp"),
        ("骨한", "kr"),
    ] {
        let command = _command(text);
        let line = engine._shape(&command.text, &command).unwrap();
        assert_eq!(
            engine._fonts[line._glyphs[0]._font]._family,
            format!("NotoSansCJK{expected}")
        );
    }
    for text in ["\u{301}A", "A\u{305}"] {
        assert_eq!(engine.measure(&_command(text)).unwrap().missing_glyphs, 0);
    }
    let mut command = _command(" WW");
    command.max_width = Some(1.0);
    assert!(engine.measure(&command).unwrap().width > 0.0);
}

#[test]
fn evicts_shaped_labels_by_count_and_reloads_identical_metrics() {
    let mut engine = _engine();
    let original = _command("Street 0");
    let first = engine.measure(&original).unwrap();
    for index in 1..=4096 {
        engine
            .measure(&_command(&format!("Street {index}")))
            .unwrap();
    }
    assert_eq!(engine.cache_stats().shapes, 4096);
    let misses = engine.cache_stats().shape_misses;
    assert_eq!(engine.measure(&original).unwrap().width, first.width);
    assert_eq!(engine.cache_stats().shape_misses, misses + 1);
}

#[test]
fn evicts_old_glyph_bounds_and_recomputes_them_without_changing_geometry() {
    let mut engine = _engine();
    let index = _font(&mut engine, "骨かな", 400);
    let first = engine._glyph_box(index, 0).unwrap();
    let additional_glyphs = u16::try_from(_OUTLINE_ENTRIES + engine._boxes.len()).unwrap();
    for id in 1..=additional_glyphs {
        engine._glyph_box(index, id).unwrap();
    }
    let key = (
        engine._fonts[index]._body_index,
        engine._fonts[index]._face_index,
        0,
    );
    assert_eq!(engine._boxes.len(), _OUTLINE_ENTRIES);
    assert!(!engine._boxes.contains_key(&key));
    assert_eq!(engine._glyph_box(index, 0).unwrap(), first);
    assert!(engine._boxes.contains_key(&key));
    assert_eq!(engine._boxes.len(), _OUTLINE_ENTRIES);
}

#[test]
fn reuses_plans_and_buffer_across_distinct_names_without_changing_shaping() {
    let mut engine = _engine();
    for text in [
        "São João",
        "Avenida Paulista",
        "القاهرة",
        "الإسكندرية",
        "ירושלים",
        "אביב",
        "मुंबई",
        "दिल्ली",
        "กรุงเทพ",
        "ประเทศไทย",
        "東京",
        "京都",
    ] {
        let command = _command(text);
        let line = engine._shape(text, &command).unwrap();
        assert!(line._width > 0.0);
        assert!(engine._buffer.is_some());
        // Compare cached shaping with a fresh call through the public shaper API.
        let font = line._glyphs[0]._font;
        let bytes = engine._body(font).unwrap();
        let face = harfrust::Font::new(
            harfrust::font::Blob::Shared(bytes),
            engine._fonts[font]._face_index,
        )
        .unwrap();
        let mut expected = harfrust::Buffer::new();
        expected.push_str(text);
        expected.set_flags(harfrust::BufferFlags::REMOVE_DEFAULT_IGNORABLES);
        expected.guess_segment_properties();
        harfrust::shape(
            &harfrust::ShaperFont::new(&face),
            &mut expected,
            harfrust::ShapeOptions::new(),
        )
        .unwrap();
        let expected_width = expected
            .glyph_positions()
            .iter()
            .map(|position| position.x_advance as f32)
            .sum::<f32>()
            * command.size
            / face.units_per_em() as f32;
        assert!((line._width - expected_width).abs() < 0.001, "{text}");
        assert_eq!(
            line._glyphs
                .iter()
                .map(|glyph| u32::from(glyph._id))
                .collect::<Vec<_>>(),
            expected
                .glyph_infos()
                .iter()
                .map(|glyph| glyph.glyph_id)
                .collect::<Vec<_>>(),
            "{text}"
        );
    }
    assert!(engine.cache_stats().shape_plan_hits > 0);
    assert!(engine.cache_stats().shape_plans <= 128);
}

#[test]
fn automatic_multiline_justification_follows_the_current_anchor_in_layout_and_pixels() {
    let mut engine = _engine();
    for (anchor, justify) in [
        ("left", "left"),
        ("right", "right"),
        ("top", "center"),
        ("bottom", "center"),
        ("center", "center"),
    ] {
        let automatic: TextCommand = serde_json::from_value(serde_json::json!({
            "text":"Museum of Art\nArt", "size":18, "color":"#173b2b", "x":160, "y":80,
            "anchor":anchor, "justify":"auto", "haloColor":"#fff", "haloWidth":1.1
        }))
        .unwrap();
        let mut explicit = automatic.clone();
        explicit.justify = serde_json::from_value(serde_json::json!(justify)).unwrap();
        let actual = engine.layout(&automatic).unwrap();
        let expected = engine.layout(&explicit).unwrap();
        assert_eq!(actual.bounds, expected.bounds, "{anchor}");
        let mut actual_pixels = Pixmap::new(320, 160).unwrap();
        let mut expected_pixels = Pixmap::new(320, 160).unwrap();
        engine
            .draw(&mut actual_pixels, &automatic, &actual, 1.0, None)
            .unwrap();
        engine
            .draw(&mut expected_pixels, &explicit, &expected, 1.0, None)
            .unwrap();
        assert_eq!(actual_pixels.data(), expected_pixels.data(), "{anchor}");
    }
}
