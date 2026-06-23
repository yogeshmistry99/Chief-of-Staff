package com.bits.app.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bits.app.data.model.Habit
import com.bits.app.ui.screens.AddEditHabitScreen
import com.bits.app.ui.screens.HomeScreen
import com.bits.app.ui.theme.BitsBg
import com.bits.app.ui.theme.BitsTheme
import com.bits.app.ui.viewmodel.HabitViewModel

sealed class Screen {
    object Home : Screen()
    object Add : Screen()
    data class Edit(val habit: Habit) : Screen()
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BitsTheme {
                BitsApp()
            }
        }
    }
}

@Composable
fun BitsApp() {
    val vm: HabitViewModel = viewModel()
    val uiState by vm.uiState.collectAsState()
    var screen by remember { mutableStateOf<Screen>(Screen.Home) }

    Scaffold(
        modifier = Modifier.fillMaxSize().background(BitsBg)
    ) { innerPadding ->
        when (val s = screen) {
            is Screen.Home -> HomeScreen(
                uiState = uiState,
                onCompleteHabit = { vm.completeHabit(it) },
                onNavigateToAdd = { screen = Screen.Add },
                onNavigateToEdit = { screen = Screen.Edit(it) },
                onClearJustCompleted = { vm.clearJustCompleted() }
            )
            is Screen.Add -> AddEditHabitScreen(
                onSave = { name, icon -> vm.addHabit(name, icon) },
                onBack = { screen = Screen.Home }
            )
            is Screen.Edit -> AddEditHabitScreen(
                existingHabit = s.habit,
                onSave = { name, icon -> vm.updateHabit(s.habit.copy(name = name, iconType = icon)) },
                onDelete = { vm.deleteHabit(s.habit) },
                onBack = { screen = Screen.Home }
            )
        }
    }
}
