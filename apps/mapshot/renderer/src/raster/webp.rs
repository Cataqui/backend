use libwebp_sys::{WebPConfig, WebPMemoryWriter, WebPPicture, WebPPreset};

struct _Picture(WebPPicture);
impl Drop for _Picture {
    fn drop(&mut self) {
        // SAFETY: this picture uniquely owns its libwebp-allocated pixel buffers.
        unsafe { libwebp_sys::WebPPictureFree(&mut self.0) };
    }
}
struct _Writer(WebPMemoryWriter);
impl Drop for _Writer {
    fn drop(&mut self) {
        // SAFETY: this initialized writer uniquely owns the encoder output allocation.
        unsafe { libwebp_sys::WebPMemoryWriterClear(&mut self.0) };
    }
}

pub(crate) fn encode_webp(
    rgba: &[u8],
    width: u32,
    height: u32,
    quality: f32,
    method: i32,
) -> Result<Vec<u8>, String> {
    if width == 0
        || height == 0
        || width > libwebp_sys::WEBP_MAX_DIMENSION
        || height > libwebp_sys::WEBP_MAX_DIMENSION
        || rgba.len() != width as usize * height as usize * 4
    {
        return Err("invalid WebP RGBA dimensions".to_string());
    }
    if !quality.is_finite() {
        return Err("invalid WebP encoder config".to_string());
    }
    // Match the existing libvips/Sharp quality 80, effort 2 boundary exactly.
    // SAFETY: every config field accepts zero, including WEBP_HINT_DEFAULT.
    // libwebp leaves the reserved use_delta_palette field untouched during init.
    let mut config: WebPConfig = unsafe { std::mem::zeroed() };
    // SAFETY: the initialized config stays alive throughout this synchronous call.
    if unsafe {
        libwebp_sys::WebPConfigInitInternal(
            &mut config,
            WebPPreset::WEBP_PRESET_DEFAULT,
            quality,
            libwebp_sys::WEBP_ENCODER_ABI_VERSION as i32,
        )
    } == 0
    {
        return Err("cannot initialize WebP config".to_string());
    }
    config.method = method;
    config.lossless = 0;
    config.exact = 0;
    config.alpha_quality = 100;
    config.target_size = 0;
    config.pass = 1;
    config.use_sharp_yuv = 0;
    config.autofilter = 0;
    config.thread_level = 1;
    // SAFETY: config is fully initialized and remains alive throughout validation.
    if unsafe { libwebp_sys::WebPValidateConfig(&config) } == 0 {
        return Err("invalid WebP encoder config".to_string());
    }
    let mut picture = _Picture(WebPPicture::new().map_err(|_| "cannot initialize WebP picture")?);
    let mut writer = _Writer(WebPMemoryWriter {
        mem: std::ptr::null_mut(),
        size: 0,
        max_size: 0,
        pad: [0],
    });
    picture.0.use_argb = 0;
    picture.0.width = width as i32;
    picture.0.height = height as i32;
    picture.0.writer = Some(libwebp_sys::WebPMemoryWrite);
    picture.0.custom_ptr = (&mut writer.0 as *mut WebPMemoryWriter).cast();
    // SAFETY: the checked RGBA slice covers every row, and picture owns its imported copy.
    if unsafe {
        libwebp_sys::WebPPictureImportRGBA(&mut picture.0, rgba.as_ptr(), width as i32 * 4)
    } == 0
    {
        return Err("cannot import WebP RGBA pixels".to_string());
    }
    // SAFETY: config is valid, pixels were imported, and writer stays stable through encoding.
    if unsafe { libwebp_sys::WebPEncode(&config, &mut picture.0) } == 0 {
        return Err(format!("WebP encoding failed: {:?}", picture.0.error_code));
    }
    if writer.0.mem.is_null() || writer.0.size == 0 {
        return Err("WebP encoder produced no bytes".to_string());
    }
    // SAFETY: libwebp owns this nonempty allocation; copy it before the writer frees it.
    Ok(unsafe { std::slice::from_raw_parts(writer.0.mem, writer.0.size) }.to_vec())
}

#[cfg(test)]
mod tests;
