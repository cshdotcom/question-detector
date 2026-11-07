#!/usr/bin/env python3
"""生成模拟试卷测试图：印刷题目 + 手写红色批注/答案"""
from PIL import Image, ImageDraw, ImageFont
import base64, json

W, H = 864, 1152  # 3:4 比例，模拟试卷
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)

font_path = "/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf"
f_title = ImageFont.truetype(font_path, 34)
f_q = ImageFont.truetype(font_path, 26)
f_small = ImageFont.truetype(font_path, 22)

# 印刷内容（黑色）
d.text((60, 40), "七年级数学期中测试卷", font=f_title, fill="black")
d.text((60, 110), "一、计算题", font=f_q, fill="black")
d.text((80, 160), "1. 计算：23 + 45 - 18 = ____", font=f_q, fill="black")
d.text((80, 210), "2. 计算：12 × 8 ÷ 4 = ____", font=f_q, fill="black")
d.text((60, 270), "二、选择题", font=f_q, fill="black")
d.text((80, 320), "3. 下列哪个是质数？", font=f_q, fill="black")
d.text((110, 370), "A. 4        B. 7        C. 9        D. 15", font=f_small, fill="black")
d.text((80, 430), "4. 一个三角形的内角和是多少度？", font=f_q, fill="black")
d.text((110, 480), "A. 90°      B. 180°     C. 270°     D. 360°", font=f_small, fill="black")
d.text((60, 540), "三、应用题", font=f_q, fill="black")
d.text((80, 590), "5. 小明买了 3 支铅笔，每支 2 元，", font=f_q, fill="black")
d.text((100, 640), "一共花了多少钱？", font=f_q, fill="black")

# 模拟手写内容（红色/蓝色，应该被去除）
d.text((560, 175), "50", font=f_q, fill="red")       # 手写答案
d.text((560, 225), "24", font=f_q, fill="blue")      # 手写答案
d.ellipse((500, 345, 560, 395), outline="red", width=4)  # 红圈选 B
d.text((520, 480), "B", font=f_q, fill="red")        # 手写答案
d.text((480, 700), "解：3 × 2 = 6（元）", font=f_q, fill="blue")  # 手写解答
d.line((80, 760, 700, 760), fill="red", width=3)     # 批改横线
d.text((720, 740), "✓", font=f_title, fill="red")    # 批改勾
d.text((60, 820), "Score: 92", font=f_q, fill="red")  # 分数

img.save("/home/z/my-project/scripts/test_exam.jpg", quality=92)

# 统计红色像素占比（验证手写是否被去除的基线）
import numpy as np
arr = np.array(img)
r, g, b = arr[:,:,0].astype(int), arr[:,:,1].astype(int), arr[:,:,2].astype(int)
red_mask = (r > 180) & (g < 110) & (b < 110)
blue_mask = (b > 140) & (r < 110)
black_mask = (r < 90) & (g < 90) & (b < 90)
total = W * H
print(json.dumps({
    "red_ratio": round(red_mask.sum() / total * 100, 3),
    "blue_ratio": round(blue_mask.sum() / total * 100, 3),
    "black_ratio": round(black_mask.sum() / total * 100, 3),
}))

with open("/home/z/my-project/scripts/test_exam_b64.txt", "w") as f:
    f.write(base64.b64encode(open("/home/z/my-project/scripts/test_exam.jpg", "rb").read()).decode())
print("test image saved")
