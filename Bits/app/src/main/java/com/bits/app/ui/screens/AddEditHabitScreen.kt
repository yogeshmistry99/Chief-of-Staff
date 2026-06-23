package com.bits.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bits.app.data.model.Habit
import com.bits.app.data.model.HabitIcon
import com.bits.app.ui.pixel.PixelSprite
import com.bits.app.ui.pixel.habitIconPixels
import com.bits.app.ui.theme.*

@Composable
fun AddEditHabitScreen(
    existingHabit: Habit? = null,
    onSave: (String, HabitIcon) -> Unit,
    onDelete: (() -> Unit)? = null,
    onBack: () -> Unit
) {
    var name by remember { mutableStateOf(existingHabit?.name ?: "") }
    var selectedIcon by remember { mutableStateOf(existingHabit?.iconType ?: HabitIcon.WATER) }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    val isEdit = existingHabit != null

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BitsBg)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // Header row
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) {
                Text("← BACK", style = MaterialTheme.typography.bodyMedium, color = BitsTextDim)
            }
            Spacer(Modifier.weight(1f))
            Text(
                text = if (isEdit) "EDIT HABIT" else "NEW HABIT",
                style = MaterialTheme.typography.headlineMedium,
                color = BitsAccent
            )
        }

        HorizontalDivider(color = BitsPanel)

        // Name field
        Text("HABIT NAME", style = MaterialTheme.typography.labelMedium, color = BitsTextDim)

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(BitsPanel, RoundedCornerShape(4.dp))
                .border(2.dp, if (name.isNotEmpty()) BitsAccent else BitsTextDim.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            BasicTextField(
                value = name,
                onValueChange = { if (it.length <= 30) name = it },
                textStyle = TextStyle(
                    color = BitsText,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 16.sp
                ),
                cursorBrush = SolidColor(BitsAccent),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            if (name.isEmpty()) {
                Text(
                    "e.g. drink water",
                    style = MaterialTheme.typography.bodyLarge,
                    color = BitsTextDim.copy(alpha = 0.4f)
                )
            }
        }

        // Icon picker
        Text("CHOOSE ICON", style = MaterialTheme.typography.labelMedium, color = BitsTextDim)

        LazyVerticalGrid(
            columns = GridCells.Fixed(5),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(HabitIcon.values().toList()) { icon ->
                val isSelected = icon == selectedIcon
                Box(
                    modifier = Modifier
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (isSelected) BitsAccent.copy(alpha = 0.2f) else BitsPanel)
                        .border(
                            width = if (isSelected) 2.dp else 1.dp,
                            color = if (isSelected) BitsAccent else BitsTextDim.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(4.dp)
                        )
                        .clickable { selectedIcon = icon }
                        .padding(8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    PixelSprite(
                        pixels = habitIconPixels(icon),
                        gridWidth = 8,
                        pixelSizePx = 5f,
                        modifier = Modifier.size(40.dp)
                    )
                }
            }
        }

        // Icon label
        Text(
            text = selectedIcon.displayName(),
            style = MaterialTheme.typography.labelMedium,
            color = BitsTextDim
        )

        Spacer(Modifier.weight(1f))

        // Save button
        Button(
            onClick = {
                if (name.isNotBlank()) {
                    onSave(name.trim(), selectedIcon)
                    onBack()
                }
            },
            enabled = name.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(4.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BitsAccent)
        ) {
            Text(
                if (isEdit) "SAVE CHANGES" else "ADD HABIT",
                style = MaterialTheme.typography.titleMedium,
                color = androidx.compose.ui.graphics.Color.Black
            )
        }

        // Delete button (edit mode)
        if (isEdit && onDelete != null) {
            if (showDeleteConfirm) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedButton(
                        onClick = { showDeleteConfirm = false },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text("CANCEL", color = BitsTextDim, style = MaterialTheme.typography.bodyMedium)
                    }
                    Button(
                        onClick = { onDelete(); onBack() },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(4.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = BitsRed)
                    ) {
                        Text("DELETE", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            } else {
                TextButton(
                    onClick = { showDeleteConfirm = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("DELETE HABIT", color = BitsRed, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

private fun HabitIcon.displayName(): String = when (this) {
    HabitIcon.WATER    -> "WATER"
    HabitIcon.WALK     -> "WALKING"
    HabitIcon.MORNING  -> "MORNING ROUTINE"
    HabitIcon.BOOK     -> "READING"
    HabitIcon.SLEEP    -> "SLEEP"
    HabitIcon.FOOD     -> "HEALTHY EATING"
    HabitIcon.MEDITATE -> "MEDITATION"
    HabitIcon.WORKOUT  -> "WORKOUT"
    HabitIcon.JOURNAL  -> "JOURNALING"
    HabitIcon.VITAMINS -> "VITAMINS"
}
