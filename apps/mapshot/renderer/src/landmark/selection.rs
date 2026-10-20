#[derive(Clone, Debug)]
pub(crate) struct LandmarkReference {
    pub anchor: [f64; 2],
    pub source_min_zoom: Option<f64>,
    pub view_zoom: f64,
    pub font_size: f64,
}

impl LandmarkReference {
    pub(crate) fn salience(&self) -> f64 {
        match self.source_min_zoom {
            // Provider display scale estimates cartographic importance, not familiarity.
            Some(min_zoom) => 2.0 / (1.0 + 2.0_f64.powf((min_zoom - self.view_zoom) / 2.0)),
            None => 1.0,
        }
    }
}

pub(crate) struct Coverage {
    _x_influences: Vec<f64>,
    _y_influences: Vec<f64>,
    _salience: f64,
}

pub(crate) struct Selection {
    _columns: Vec<f64>,
    _rows: Vec<f64>,
    _samples: Vec<(f64, f64)>,
    _maximum_salience: f64,
}

impl Selection {
    pub(crate) fn new(viewport: [f64; 2]) -> Self {
        let mut columns = Vec::new();
        let mut rows = Vec::new();
        let mut samples = Vec::new();
        // Integrate coverage in logical pixels; cells control precision, never count.
        let mut y = 0.0;
        while y < viewport[1] {
            let cell_height = (viewport[1] - y).min(24.0);
            rows.push(y + cell_height / 2.0);
            let mut x = 0.0;
            while x < viewport[0] {
                let cell_width = (viewport[0] - x).min(24.0);
                if y == 0.0 {
                    columns.push(x + cell_width / 2.0);
                }
                let relative_distance = ((x + cell_width / 2.0 - viewport[0] / 2.0).powi(2)
                    + (y + cell_height / 2.0 - viewport[1] / 2.0).powi(2))
                    / (viewport[0].min(viewport[1]) / 2.0).powi(2);
                samples.push((
                    cell_width * cell_height * (0.5 + 0.5 * (-0.5 * relative_distance).exp()),
                    0.0,
                ));
                x += cell_width;
            }
            y += cell_height;
        }
        let weighted_area = samples.iter().map(|(area, _)| area).sum::<f64>();
        let normalization = viewport[0] * viewport[1] / weighted_area;
        for (area, _) in &mut samples {
            *area *= normalization;
        }
        Self {
            _columns: columns,
            _rows: rows,
            _samples: samples,
            _maximum_salience: 0.0,
        }
    }

    pub(crate) fn set_maximum_salience(&mut self, maximum: f64) {
        self._maximum_salience = maximum;
    }

    pub(crate) fn prepare(&self, reference: &LandmarkReference) -> Coverage {
        let sigma_squared = (reference.font_size * 6.8).powi(2);
        let raw_salience = reference.salience();
        let salience = if self._maximum_salience > 0.0 {
            raw_salience / self._maximum_salience
        } else {
            raw_salience
        };
        Coverage {
            // Gaussian influence separates by axis, keeping each candidate's cache
            // proportional to viewport width + height rather than viewport area.
            _x_influences: self
                ._columns
                .iter()
                .map(|x| (-(reference.anchor[0] - x).powi(2) / (2.0 * sigma_squared)).exp())
                .collect(),
            _y_influences: self
                ._rows
                .iter()
                .map(|y| (-(reference.anchor[1] - y).powi(2) / (2.0 * sigma_squared)).exp())
                .collect(),
            _salience: salience,
        }
    }

    pub(crate) fn gain(&self, candidate: &Coverage) -> f64 {
        let mut gain = 0.0;
        for (samples, y_influence) in self
            ._samples
            .chunks(candidate._x_influences.len())
            .zip(&candidate._y_influences)
        {
            let row_salience = candidate._salience * y_influence;
            for ((area, coverage), x_influence) in samples.iter().zip(&candidate._x_influences) {
                gain += area * (row_salience * x_influence - coverage).max(0.0);
            }
        }
        gain
    }

    pub(crate) fn cost(
        &self,
        reference: &LandmarkReference,
        text_bounds: [f32; 4],
        badge_bounds: &[[f32; 4]],
    ) -> f64 {
        let text_area = f64::from((text_bounds[2] - text_bounds[0]).max(0.0))
            * f64::from((text_bounds[3] - text_bounds[1]).max(0.0));
        let badge_area = badge_bounds
            .iter()
            .map(|bounds| {
                f64::from((bounds[2] - bounds[0]).max(0.0))
                    * f64::from((bounds[3] - bounds[1]).max(0.0))
            })
            .sum::<f64>();
        // Concave text cost keeps long civic names competitive with short shop names.
        let footprint = badge_area + (text_area * reference.font_size.powi(2) * 8.0).sqrt();
        footprint * 4.0
    }

    pub(crate) fn record(&mut self, candidate: &Coverage) {
        for (samples, y_influence) in self
            ._samples
            .chunks_mut(candidate._x_influences.len())
            .zip(&candidate._y_influences)
        {
            let row_salience = candidate._salience * y_influence;
            for ((_, coverage), x_influence) in samples.iter_mut().zip(&candidate._x_influences) {
                *coverage = coverage.max(row_salience * x_influence);
            }
        }
    }
}

#[cfg(test)]
mod tests;
