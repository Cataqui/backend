use super::*;
use std::path::Path;

fn _engine() -> TextEngine {
    let root = std::env::var_os("MAPSHOT_FONT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../dist/native/assets/fonts")
        });
    TextEngine::new(&root).expect("prepare the Mapshot font assets before native tests")
}

fn _label(text: &str) -> LandmarkLabel {
    LandmarkLabel {
        text: text.into(),
        word_ends: if text.is_empty() {
            vec![]
        } else {
            vec![text.len()]
        },
        grapheme_ends: text
            .char_indices()
            .map(|(start, character)| start + character.len_utf8())
            .collect(),
    }
}

fn _input(text: &str) -> LandmarkLayoutCommand {
    LandmarkLayoutCommand {
        candidates: vec![LandmarkCandidate {
            id: "landmark:park".into(),
            labels: vec![_label(text)],
            center: [240.0, 240.0],
            badge: LandmarkBadge {
                path: "/assets/park.png".into(),
                logical_size: 26.0,
            },
            text_color: "#008236".into(),
            rank: 0.0,
            source_min_zoom: Some(15.0),
        }],
        style: LandmarkStyle {
            badge_radius: 9.0,
            badge_stroke_width: 1.25,
            label_gap: 3.0,
            edge_margin: 6.0,
            label_font_size: 10.0,
            label_max_width: 80.0,
            label_max_lines: 3,
            label_line_height: 12.0,
            label_letter_spacing: -0.2,
            label_halo_width: 2.0,
        },
        view_zoom: 13.0,
        priority: 2200000.0,
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct _LayoutFixture {
    x: f64,
    y: f64,
    label: LandmarkLabel,
    expected: serde_json::Value,
    expected_error: bool,
}

#[test]
fn wrapping_and_viewport_admission_match_all_qualified_icu_layouts() {
    let fixtures: Vec<_LayoutFixture> =
        serde_json::from_str(include_str!("fixtures/layout.json")).unwrap();
    assert_eq!(
        fixtures.len(),
        100,
        "all qualified ICU layout cases must run"
    );
    let mut engine = _engine();
    for fixture in fixtures {
        let mut input = _input(&fixture.label.text);
        input.candidates[0].center = [fixture.x, fixture.y];
        input.candidates[0].labels[0] = fixture.label;
        let label = &input.candidates[0].labels[0].text;
        let expanded = expand(&input, [480.0, 480.0]);
        let actual = match expanded.first() {
            Some(expanded) => prepare_text(&expanded.text, [480.0, 480.0], &mut engine),
            None => Ok(None),
        };
        let context = format!("{} at {:?}", label, input.candidates[0].center);
        if fixture.expected_error || !label.chars().any(crate::text::_visible_character) {
            assert!(actual.unwrap().is_none(), "{context}");
            continue;
        }
        let actual = actual.unwrap_or_else(|error| panic!("{context}: {error}"));
        let expected: Option<TextCommand> = serde_json::from_value(fixture.expected).unwrap();
        assert_eq!(actual.is_some(), expected.is_some(), "{context}");
        if let (Some(actual), Some(mut expected)) = (actual, expected) {
            expected.justify = TextJustify::Auto;
            assert!(actual.landmark.is_none());
            assert_eq!(actual.text, expected.text, "{context}");
            assert_eq!(
                actual.alternatives.len(),
                expected.alternatives.len(),
                "{context}"
            );
            for (actual, expected) in actual.alternatives.iter().zip(&expected.alternatives) {
                assert_eq!(actual.anchor, expected.anchor, "{context}");
                assert_eq!(actual.x, expected.x, "{context}");
                assert_eq!(actual.y, expected.y, "{context}");
            }
            let actual = engine.layout(&actual).unwrap();
            let expected = engine.layout(&expected).unwrap();
            assert_eq!(actual.glyph_count, expected.glyph_count, "{context}");
            assert_eq!(actual.bounds, expected.bounds, "{context}");
        }
    }
}

#[test]
fn trims_unicode_nel_whitespace_from_landmark_lines() {
    let input = _input("\u{0085}Park\u{0085}");
    let mut engine = _engine();
    let expanded = expand(&input, [480.0, 480.0]);
    let prepared = prepare_text(&expanded[0].text, [480.0, 480.0], &mut engine)
        .unwrap()
        .unwrap();
    assert_eq!(prepared.text, "Park");
}

#[test]
fn expansion_is_lazy_and_measurements_reuse_native_shaping_caches() {
    let input = _input("abcdefghijklmnopqrstuvwxyz");
    let mut engine = _engine();
    let expanded = expand(&input, [480.0, 480.0]);
    assert_eq!(engine.cache_stats().shape_misses, 0);
    let first = prepare_text(&expanded[0].text, [480.0, 480.0], &mut engine)
        .unwrap()
        .unwrap();
    let misses = engine.cache_stats().shape_misses;
    assert!(misses > 0);
    let second = prepare_text(&expanded[0].text, [480.0, 480.0], &mut engine)
        .unwrap()
        .unwrap();
    assert_eq!(first.text, second.text);
    assert_eq!(engine.cache_stats().shape_misses, misses);
    assert!(engine.cache_stats().shape_hits > 0);
}

#[test]
fn ranks_all_candidates_and_rejects_badge_overflow_before_any_text_shaping() {
    let mut input = _input("Museum");
    input.candidates = (0..100)
        .rev()
        .map(|rank| {
            let mut candidate = _input("Museum").candidates.pop().unwrap();
            candidate.id = format!("landmark:{rank}");
            candidate.rank = f64::from(rank);
            candidate
        })
        .collect();
    let expanded = expand(&input, [480.0, 480.0]);
    assert_eq!(expanded.len(), 100);
    assert_eq!(expanded[0].text.id.as_deref(), Some("landmark:0"));
    assert_eq!(expanded[99].text.id.as_deref(), Some("landmark:99"));
    for center in [[14.0, 240.0], [466.0, 240.0], [240.0, 14.0], [240.0, 466.0]] {
        let mut input = _input("Museum");
        input.candidates[0].center = center;
        assert!(expand(&input, [480.0, 480.0]).is_empty());
    }
    assert!(
        expand(&_input("Museum"), [480.0, 480.0])[0]
            .text
            .landmark
            .is_some()
    );
}

#[test]
fn preserves_authoritative_grapheme_units_when_truncating() {
    let mut input = _input("aabbccddeeffgg");
    input.style.label_font_size = 18.0;
    input.style.label_max_width = 48.0 * 1.15;
    input.style.label_max_lines = 1;
    input.candidates[0].labels[0].grapheme_ends = (2..=input.candidates[0].labels[0].text.len())
        .step_by(2)
        .collect();
    let expanded = expand(&input, [480.0, 480.0]);
    let prepared = prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine())
        .unwrap()
        .unwrap();
    // Original test font was regular; semibold's wider paired units still
    // must be kept whole rather than resegmented by the Rust Unicode version.
    assert_eq!(prepared.text, "aa…");
}

#[test]
fn invalid_word_boundaries_return_an_error_instead_of_panicking_during_wrapping() {
    for ends in [vec![4, 6], vec![7]] {
        let mut input = _input("Praça");
        input.candidates[0].labels[0].word_ends = ends;
        let expanded = expand(&input, [480.0, 480.0]);
        assert!(prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine()).is_err());
    }
}

#[test]
fn invalid_grapheme_boundaries_return_an_error_instead_of_panicking_during_wrapping() {
    let mut input = _input("Praça Praça Praça Praça Praça");
    input.candidates[0].labels[0].grapheme_ends = vec![4];
    let expanded = expand(&input, [480.0, 480.0]);
    assert!(prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine()).is_err());
}

#[test]
fn omits_an_unsupported_landmark_without_failing_the_render() {
    let input = _input("Museum \u{10ffff}");
    let expanded = expand(&input, [480.0, 480.0]);
    assert!(
        prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine())
            .expect("unsupported optional landmarks must not fail the map")
            .is_none()
    );
}

#[test]
fn omits_a_missing_glyph_even_when_truncation_would_remove_it() {
    let mut input = _input("Museum abcdefghijklmnopqrstuvwxyz\u{10ffff}");
    input.style.label_max_lines = 1;
    input.candidates[0].labels[0].word_ends = vec![6, 7, input.candidates[0].labels[0].text.len()];
    let expanded = expand(&input, [480.0, 480.0]);
    assert!(
        prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine())
            .unwrap()
            .is_none()
    );
}

#[test]
fn chooses_a_real_provider_alternative_after_full_original_shape_admission() {
    let mut input = _input("Museum abcdefghijklmnopqrstuvwxyz\u{10ffff}");
    input.style.label_max_lines = 1;
    input.candidates[0].labels.push(_label("Museu"));
    let expanded = expand(&input, [480.0, 480.0]);
    let prepared = prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine())
        .unwrap()
        .unwrap();
    assert_eq!(prepared.text, "Museu");
}

#[test]
fn admits_a_real_tibetan_provider_alternative_through_native_wrapping() {
    let mut input = _input("\u{10ffff}");
    input.candidates[0].labels.push(_label("དཔེ་མཛོད་ཁང་།"));
    let expanded = expand(&input, [480.0, 480.0]);
    let prepared = prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine())
        .unwrap()
        .expect("the genuine Tibetan provider name must be eligible");
    assert!(
        prepared
            .text
            .chars()
            .any(|character| matches!(character as u32, 0x0f00..=0x0fff))
    );
}

#[test]
fn tries_nonempty_provider_names_without_turning_invisible_names_into_badges() {
    let mut input = _input(" \u{feff}\u{200d}");
    input.candidates[0].labels.push(_label("東京"));
    let expanded = expand(&input, [480.0, 480.0]);
    let prepared = prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine())
        .unwrap()
        .unwrap();
    assert_eq!(prepared.text, "東京");
    input.candidates[0].labels.pop();
    let expanded = expand(&input, [480.0, 480.0]);
    assert!(
        prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine())
            .unwrap()
            .is_none()
    );
}

#[test]
fn valid_primary_keeps_unattempted_alternatives_lazy() {
    let mut input = _input("Museum");
    let mut malformed = _label("東京");
    malformed.word_ends = vec![1];
    input.candidates[0].labels.push(malformed);
    let expanded = expand(&input, [480.0, 480.0]);
    let prepared = prepare_text(&expanded[0].text, [480.0, 480.0], &mut _engine())
        .unwrap()
        .unwrap();
    assert_eq!(prepared.text, "Museum");
}

#[test]
fn old_generic_text_wire_fields_cannot_supply_native_only_layout_options() {
    let command = serde_json::from_value::<TextCommand>(serde_json::json!({
        "text":"Museum","size":10,"color":"#333333",
        "landmark":{"wordEnds":[6],"graphemeEnds":[1,2,3,4,5,6]}
    }));
    assert!(command.is_err());
    assert!(
        serde_json::from_value::<TextCommand>(serde_json::json!({
            "text":"Museum","size":10,"color":"#333333","landmark":null
        }))
        .is_err()
    );
}

#[test]
fn colored_multiline_landmarks_keep_automatic_justification_after_edge_filtering() {
    let mut engine = _engine();
    for (x, anchor) in [(25.0, "left"), (455.0, "right")] {
        let mut input = _input("Museum of Contemporary Art");
        input.candidates[0].center[0] = x;
        input.candidates[0].labels[0].word_ends = vec![6, 7, 9, 10, 22, 23, 26];
        input.candidates[0].text_color = "#7F22FE".into();
        let expanded = expand(&input, [480.0, 480.0]);
        let prepared = prepare_text(&expanded[0].text, [480.0, 480.0], &mut engine)
            .unwrap()
            .unwrap();
        assert!(prepared.text.contains('\n'));
        assert_eq!(prepared.alternatives.len(), 1);
        assert_eq!(prepared.anchor, anchor);
        assert!(matches!(prepared.justify, TextJustify::Auto));
        assert_eq!(prepared.color, "#7F22FE");
        assert_eq!(prepared.halo_color.as_deref(), Some("#ffffff"));
        assert_eq!(prepared.halo_width, 1.1);
    }
}
