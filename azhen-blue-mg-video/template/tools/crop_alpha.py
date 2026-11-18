# 透明底插图按 alpha 包围盒裁边：python crop_alpha.py 输入.png 输出.png   依赖 pillow
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
bb = im.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
im.crop(bb).save(sys.argv[2]); print(sys.argv[2], im.crop(bb).size)
