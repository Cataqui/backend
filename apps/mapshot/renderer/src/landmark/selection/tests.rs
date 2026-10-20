use super::{LandmarkReference, Selection};

fn _reference(anchor: [f64; 2]) -> LandmarkReference {
    LandmarkReference {
        anchor: anchor,
        source_min_zoom: None,
        view_zoom: 15.0,
        font_size: 14.0,
    }
}

#[test]
fn missing_source_scale_uses_neutral_weight() {
    let reference = _reference([120.0, 120.0]);

    assert_eq!(reference.salience(), 1.0);
}

#[test]
fn source_scale_matching_view_zoom_uses_neutral_weight() {
    let mut reference = _reference([120.0, 120.0]);
    reference.source_min_zoom = Some(reference.view_zoom);

    assert_eq!(reference.salience(), 1.0);
}

#[test]
fn earlier_source_display_scale_increases_salience() {
    let mut important = _reference([120.0, 120.0]);
    important.source_min_zoom = Some(11.0);
    let mut local = _reference([120.0, 120.0]);
    local.source_min_zoom = Some(17.0);

    assert!(important.salience() > local.salience());
}

#[test]
fn prepare_normalizes_salience_against_the_eligible_maximum() {
    let mut selection = Selection::new([240.0, 240.0]);
    let mut reference = _reference([120.0, 120.0]);
    reference.source_min_zoom = Some(13.0);
    let raw = selection.prepare(&reference);
    let raw_gain = selection.gain(&raw);
    selection.set_maximum_salience(reference.salience());
    let normalized = selection.prepare(&reference);

    assert!((selection.gain(&normalized) - raw_gain / reference.salience()).abs() < 1e-8);
}

#[test]
fn zero_maximum_preserves_absolute_salience() {
    let mut selection = Selection::new([240.0, 240.0]);
    let reference = _reference([120.0, 120.0]);
    let before = selection.prepare(&reference);
    selection.set_maximum_salience(0.0);
    let after = selection.prepare(&reference);

    assert_eq!(selection.gain(&before), selection.gain(&after));
}

#[test]
fn record_makes_the_same_reference_redundant() {
    let mut selection = Selection::new([240.0, 240.0]);
    let coverage = selection.prepare(&_reference([120.0, 120.0]));
    selection.record(&coverage);

    assert_eq!(selection.gain(&coverage), 0.0);
}

#[test]
fn marginal_gain_decreases_as_coverage_accumulates() {
    let mut selection = Selection::new([480.0, 480.0]);
    let candidate = selection.prepare(&_reference([300.0, 300.0]));
    let first = selection.prepare(&_reference([180.0, 300.0]));
    let second = selection.prepare(&_reference([300.0, 180.0]));
    let empty_gain = selection.gain(&candidate);
    selection.record(&first);
    let first_gain = selection.gain(&candidate);
    selection.record(&second);
    let second_gain = selection.gain(&candidate);

    assert!(empty_gain > first_gain && first_gain > second_gain && second_gain > 0.0);
}

#[test]
fn existing_reference_reduces_nearby_gain_more_than_distant_gain() {
    let mut selection = Selection::new([720.0, 240.0]);
    let selected = selection.prepare(&_reference([120.0, 120.0]));
    let nearby = selection.prepare(&_reference([150.0, 120.0]));
    let distant = selection.prepare(&_reference([600.0, 120.0]));
    selection.record(&selected);

    assert!(selection.gain(&distant) > selection.gain(&nearby));
}

#[test]
fn stronger_reference_covers_weaker_reference_at_the_same_anchor() {
    let mut selection = Selection::new([240.0, 240.0]);
    let mut strongest = _reference([120.0, 120.0]);
    strongest.source_min_zoom = Some(11.0);
    let stronger_coverage = selection.prepare(&strongest);
    let weaker_coverage = selection.prepare(&_reference([120.0, 120.0]));
    selection.record(&stronger_coverage);

    assert_eq!(selection.gain(&weaker_coverage), 0.0);
}

#[test]
fn partial_cells_contribute_their_actual_viewport_area() {
    let selection = Selection::new([23.0, 17.0]);
    let coverage = selection.prepare(&_reference([11.5, 8.5]));

    assert_eq!(selection.gain(&coverage), 23.0 * 17.0);
}

#[test]
fn coverage_sample_weights_treat_mirrored_references_equally() {
    let selection = Selection::new([480.0, 240.0]);
    let left = selection.prepare(&_reference([96.0, 120.0]));
    let right = selection.prepare(&_reference([384.0, 120.0]));

    assert!((selection.gain(&left) - selection.gain(&right)).abs() < 1e-8);
}

#[test]
fn center_focus_keeps_edge_context_and_preserves_total_viewport_weight() {
    let selection = Selection::new([480.0, 960.0]);
    let minimum = selection
        ._samples
        .iter()
        .map(|(area, _)| *area)
        .fold(f64::INFINITY, f64::min);
    let maximum = selection
        ._samples
        .iter()
        .map(|(area, _)| *area)
        .fold(0.0_f64, f64::max);
    let total = selection
        ._samples
        .iter()
        .map(|(area, _)| *area)
        .sum::<f64>();
    assert!(minimum > 0.0 && maximum > minimum && maximum / minimum < 2.0);
    assert!((total - 480.0 * 960.0).abs() < 1e-6);
}

#[test]
fn visual_cost_combines_badges_with_concave_text_footprint() {
    let selection = Selection::new([240.0, 240.0]);
    let reference = _reference([120.0, 120.0]);
    let cost = selection.cost(
        &reference,
        [10.0, 10.0, 90.0, 30.0],
        &[[100.0, 100.0, 120.0, 120.0]],
    );

    assert_eq!(
        cost,
        (400.0 + (1600.0 * 14.0_f64.powi(2) * 8.0).sqrt()) * 4.0
    );
}

#[test]
fn longer_names_have_concave_rather_than_linear_text_cost() {
    let selection = Selection::new([240.0, 240.0]);
    let reference = _reference([120.0, 120.0]);
    let short = selection.cost(&reference, [0.0, 0.0, 20.0, 20.0], &[]);
    let long = selection.cost(&reference, [0.0, 0.0, 80.0, 20.0], &[]);

    assert_eq!(long, short * 2.0);
}

#[test]
fn empty_bounds_have_no_visual_cost() {
    let selection = Selection::new([240.0, 240.0]);
    let reference = _reference([120.0, 120.0]);

    assert_eq!(
        selection.cost(
            &reference,
            [20.0, 20.0, 10.0, 10.0],
            &[[5.0, 5.0, 1.0, 1.0]]
        ),
        0.0
    );
}
