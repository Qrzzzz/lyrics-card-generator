using System;
using System.Linq;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace LyricsCard.Setup
{
    // Standalone approximation of the app's spatial palette: chromatic samples,
    // weighted region centers and broad color fields. No browser/runtime dependency.
    internal static class IconBackground
    {
        internal static BitmapSource Create(BitmapSource icon)
        {
            var source = new FormatConvertedBitmap(icon, PixelFormats.Bgra32, null, 0);
            int stride = source.PixelWidth * 4;
            var input = new byte[stride * source.PixelHeight];
            source.CopyPixels(input, stride, 0);
            var bins = Enumerable.Range(0, 12).Select(_ => new double[6]).ToArray();
            for (int y = 0; y < source.PixelHeight; y += 2)
                for (int x = 0; x < source.PixelWidth; x += 2)
                {
                    int p = y * stride + x * 4;
                    double r = input[p + 2] / 255.0, g = input[p + 1] / 255.0, b = input[p] / 255.0;
                    double max = Math.Max(r, Math.Max(g, b)), min = Math.Min(r, Math.Min(g, b)), delta = max - min;
                    if (input[p + 3] < 200 || delta < 0.12 || max < 0.2) continue;
                    double hue = max == r ? ((g - b) / delta + 6) % 6 : max == g ? (b - r) / delta + 2 : (r - g) / delta + 4;
                    var bin = bins[Math.Min(11, (int)(hue * 2))];
                    double weight = delta * delta;
                    bin[0] += weight; bin[1] += r * weight; bin[2] += g * weight; bin[3] += b * weight;
                    bin[4] += (double)x / source.PixelWidth * weight; bin[5] += (double)y / source.PixelHeight * weight;
                }
            var regions = bins.Where(bin => bin[0] > 0).OrderByDescending(bin => bin[0]).Take(5).ToArray();
            foreach (var region in regions)
                for (int i = 1; i < 6; i++) region[i] /= region[0];
            const int width = 240, height = 280;
            var pixels = new byte[width * height * 4];
            for (int y = 0; y < height; y++)
                for (int x = 0; x < width; x++)
                {
                    double total = 0, r = 0, g = 0, b = 0;
                    foreach (var region in regions)
                    {
                        double dx = (double)x / width - region[4], dy = (double)y / height - region[5];
                        double weight = Math.Sqrt(region[0]) * Math.Exp(-(dx * dx + dy * dy) / 0.07);
                        total += weight; r += region[1] * weight; g += region[2] * weight; b += region[3] * weight;
                    }
                    if (total > 0) { r /= total; g /= total; b /= total; }
                    double grey = (r + g + b) / 3;
                    // Bounded channels guarantee white text remains readable everywhere.
                    double shade = 0.85 + 0.15 * (1.0 - (double)y / height);
                    int p = (y * width + x) * 4;
                    pixels[p + 2] = (byte)((16 + 82 * (r * 0.9 + grey * 0.1)) * shade);
                    pixels[p + 1] = (byte)((18 + 82 * (g * 0.9 + grey * 0.1)) * shade);
                    pixels[p] = (byte)((24 + 82 * (b * 0.9 + grey * 0.1)) * shade);
                    pixels[p + 3] = 255;
                }
            var bitmap = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, pixels, width * 4);
            bitmap.Freeze();
            return bitmap;
        }
    }
}
