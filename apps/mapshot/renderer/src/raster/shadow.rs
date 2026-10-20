use libblur::{BlurImage, BlurImageMut, CLTParameters, FastBlurChannels, ThreadingPolicy};
use tiny_skia::{FillRule, Mask, Path, Pixmap, PixmapPaint, Transform};

fn _blur(mask: &Mask, sigma: f32) -> Result<Pixmap, String> {
    let mut blurred = vec![0_u8; mask.data().len()];
    libblur::gaussian_box_blur(
        &BlurImage::borrow(
            mask.data(),
            mask.width(),
            mask.height(),
            FastBlurChannels::Plane,
        ),
        &mut BlurImageMut::borrow(
            &mut blurred,
            mask.width(),
            mask.height(),
            FastBlurChannels::Plane,
        ),
        CLTParameters::new(sigma),
        ThreadingPolicy::Single,
    )
    .map_err(|error| format!("shadow blur: {error:?}"))?;
    let mut shadow = Pixmap::new(mask.width(), mask.height()).ok_or("shadow allocation")?;
    for (pixel, alpha) in shadow.data_mut().chunks_exact_mut(4).zip(blurred) {
        pixel[3] = (f32::from(alpha) * 0.20).round() as u8;
    }
    Ok(shadow)
}

pub(crate) fn text_shadow(
    pixmap: &mut Pixmap,
    path: &Path,
    ratio: f32,
    clip: Option<&Mask>,
) -> Result<(), String> {
    // A 2px CSS-style blur has a sigma of one logical pixel.
    let sigma = ratio;
    let pad = (3.0 * sigma).ceil();
    let bounds = path.bounds();
    let left = (bounds.left() * ratio).floor() - pad;
    let top = (bounds.top() * ratio).floor() - pad;
    let width = (bounds.right() * ratio).ceil() + pad - left;
    let height = (bounds.bottom() * ratio).ceil() + pad - top;
    let mut mask = Mask::new(width as u32, height as u32).ok_or("text shadow allocation")?;
    mask.fill_path(
        path,
        FillRule::Winding,
        true,
        Transform::from_scale(ratio, ratio).post_translate(-left, -top),
    );
    let shadow = _blur(&mask, sigma)?;
    pixmap.draw_pixmap(
        left as i32,
        top as i32,
        shadow.as_ref(),
        &PixmapPaint::default(),
        Transform::identity(),
        clip,
    );
    Ok(())
}

pub(crate) fn badge_shadow(asset: &Pixmap) -> Result<Pixmap, String> {
    let pad = 6_u32; // Three sigma at the fixed 2x badge density.
    let width = asset.width() + pad * 2;
    let height = asset.height() + pad * 2;
    let mut mask = Mask::new(width, height).ok_or("badge shadow allocation")?;
    for y in 0..asset.height() {
        for x in 0..asset.width() {
            mask.data_mut()[((y + pad) * width + x + pad) as usize] =
                asset.data()[((y * asset.width() + x) * 4 + 3) as usize];
        }
    }
    _blur(&mask, 2.0)
}

#[cfg(test)]
mod tests;
